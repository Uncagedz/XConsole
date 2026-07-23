import { CreditLedgerType, Prisma, Role } from '@prisma/client';
import {
  createUserRequestSchema,
  normalizeAccessibleProfileRoles,
  updateUserRequestSchema,
  userBioSchema,
} from '@drivecentric-ai/shared';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { toPrismaRole, toPrismaUserStatus, toPublicUser } from '../domain/mappers.js';
import { defaultPermissionsForRole } from '../domain/permissions.js';
import { permissionProfileForRole } from '../domain/permission-profiles.js';
import { writeAuditLog } from './audit.service.js';
import { FREE_SELLING_CREDIT_MICROS } from './billing.service.js';
import type { Request } from 'express';

export class UserService {
  async listUsers(actor: NonNullable<Request['auth']>) {
    const where =
      actor.role === 'owner'
        ? {}
        : {
            dealershipId: actor.dealershipId,
            role: {
              not: Role.OWNER,
            },
          };

    const users = await prisma.user.findMany({
      where,
      include: { dealership: { select: { name: true, settings: true } } },
      orderBy: [{ dealershipId: 'asc' }, { name: 'asc' }],
    });

    return users.map(toPublicUser);
  }

  async getUser(actor: NonNullable<Request['auth']>, id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { dealership: { select: { name: true, settings: true } } },
    });
    if (!user) throw notFound('User not found');
    if (actor.role !== 'owner' && user.dealershipId !== actor.dealershipId) {
      throw forbidden();
    }
    return toPublicUser(user);
  }

  async createUser(actor: NonNullable<Request['auth']>, rawInput: unknown, req?: Request) {
    const input = createUserRequestSchema.parse(rawInput);
    if (actor.role !== 'owner' && actor.role !== 'manager') throw forbidden();
    if (actor.role !== 'owner' && input.role === 'owner') throw forbidden('Only owners can create owners');
    if (input.role === 'owner') throw forbidden('The owner account already exists. Create managers, BDC, or salespeople here.');

    const dealershipId = actor.role === 'owner' ? input.dealershipId ?? actor.dealershipId : actor.dealershipId;
    const dealership = await prisma.dealership.findUnique({
      where: { id: dealershipId },
      select: { settings: true },
    });
    const profile = permissionProfileForRole(input.role, dealership?.settings);
    const accessibleProfileRoles = normalizeAccessibleProfileRoles(input.role, input.accessibleProfileRoles);
    const startingCredit = FREE_SELLING_CREDIT_MICROS;

    try {
      const created = await prisma.user.create({
        data: {
          userId: input.userId.trim(),
          email: input.email.trim().toLowerCase(),
          name: input.name,
          signatureName: input.signatureName ?? input.name,
          signatureDealershipName: input.signatureDealershipName ?? null,
          passwordHash: await hashPassword(input.password),
          role: toPrismaRole(input.role),
          dealershipId,
          aiEnabled: input.aiEnabled,
          permissions: input.permissions ?? profile.permissions,
          accessibleProfileRoles,
          dailyRequestLimit: null,
          bonusDailyRequestLimit: 0,
          monthlyRequestLimit: null,
          dailyTokenLimit: null,
          creditBalanceMicros: startingCredit,
          freeCreditGrantedMicros: startingCredit,
          lifetimeCreditMicros: startingCredit,
        },
        include: { dealership: { select: { name: true, settings: true } } },
      });

      if (startingCredit > 0) {
        await prisma.creditLedger.create({
          data: {
            dealershipId,
            userId: created.id,
            actorUserId: actor.userId,
            type: CreditLedgerType.FREE_GRANT,
            amountMicros: startingCredit,
            costMicros: 0,
            profitMicros: startingCredit,
            note: 'Initial $1 selling-price free credit',
            metadata: { source: 'user_create' },
          },
        });
      }

      await writeAuditLog({
        action: 'user.create',
        targetType: 'user',
        targetId: created.id,
        dealershipId,
        actorUserId: actor.userId,
        metadata: { userId: created.userId, role: input.role },
        req,
      });

      return toPublicUser(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('User ID or email already exists');
      }
      throw error;
    }
  }

  async updateUser(actor: NonNullable<Request['auth']>, id: string, rawInput: unknown, req?: Request) {
    const input = updateUserRequestSchema.parse(rawInput);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User not found');
    if (actor.role !== 'owner' && target.dealershipId !== actor.dealershipId) throw forbidden();
    if (actor.role !== 'owner' && (target.role === Role.OWNER || input.role === 'owner')) {
      throw forbidden('Only owners can modify owners');
    }
    if (target.role !== Role.OWNER && input.role === 'owner') {
      throw forbidden('The owner account is unique. Promote users to manager instead.');
    }

    const data: Prisma.UserUncheckedUpdateInput = {};
    const previousRole = target.role;
    const nextRole = input.role !== undefined ? toPrismaRole(input.role) : target.role;
    const nextPublicRole = input.role ?? (target.role === Role.OWNER ? 'owner' : target.role === Role.MANAGER ? 'manager' : target.role === Role.BDC ? 'bdc' : 'salesperson');
    const dealership = await prisma.dealership.findUnique({
      where: { id: target.dealershipId },
      select: { settings: true },
    });
    const nextAccessibleProfileRoles = normalizeAccessibleProfileRoles(nextPublicRole, input.accessibleProfileRoles ?? target.accessibleProfileRoles);
    if (input.email !== undefined) data.email = input.email;
    if (input.name !== undefined) data.name = input.name;
    if (input.signatureName !== undefined) data.signatureName = input.signatureName;
    if (input.signatureDealershipName !== undefined) data.signatureDealershipName = input.signatureDealershipName ?? null;
    if (input.role !== undefined) data.role = toPrismaRole(input.role);
    if (input.status !== undefined) data.status = toPrismaUserStatus(input.status);
    if (input.aiEnabled !== undefined) data.aiEnabled = input.aiEnabled;
    if (input.accessibleProfileRoles !== undefined || input.role !== undefined || target.role === Role.OWNER || nextRole === Role.OWNER) {
      data.accessibleProfileRoles = nextAccessibleProfileRoles;
    }
    if (input.role !== undefined && input.role !== 'owner' && toPrismaRole(input.role) !== previousRole && input.permissions === undefined) {
      const profile = permissionProfileForRole(input.role, dealership?.settings);
      data.permissions = profile.permissions;
      data.dailyRequestLimit = null;
      data.monthlyRequestLimit = null;
      data.dailyTokenLimit = null;
    }
    if (input.permissions !== undefined) {
      data.permissions = nextRole === Role.OWNER ? defaultPermissionsForRole('owner') : input.permissions;
    }
    if (nextRole !== Role.OWNER) {
      data.dailyRequestLimit = null;
      data.bonusDailyRequestLimit = 0;
      data.monthlyRequestLimit = null;
      data.dailyTokenLimit = null;
    }
    if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);
    if (nextRole === Role.OWNER) {
      data.permissions = defaultPermissionsForRole('owner');
      data.accessibleProfileRoles = normalizeAccessibleProfileRoles('owner', target.accessibleProfileRoles);
      data.dailyRequestLimit = null;
      data.bonusDailyRequestLimit = 0;
      data.monthlyRequestLimit = null;
      data.dailyTokenLimit = null;
      data.creditBalanceMicros = 0;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: { dealership: { select: { name: true, settings: true } } },
    });

    if (input.status && input.status !== 'active') {
      await prisma.session.updateMany({
        where: { userId: updated.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await writeAuditLog({
      action: 'user.update',
      targetType: 'user',
      targetId: updated.id,
      dealershipId: updated.dealershipId,
      actorUserId: actor.userId,
      metadata: { fields: Object.keys(input) },
      req,
    });

    return toPublicUser(updated);
  }

  async updateBio(actor: NonNullable<Request['auth']>, rawInput: unknown, req?: Request) {
    const input = userBioSchema.parse(rawInput);
    const name = `${input.firstName} ${input.lastName}`;
    const updated = await prisma.user.update({
      where: { id: actor.userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
        hometown: input.hometown,
        movedHereReason: input.movedHereReason,
        yearsSellingCars: input.yearsSellingCars,
        previousCareer: input.previousCareer,
        militaryService: input.militaryService,
        favoriteLocalSpot: input.favoriteLocalSpot,
        personalWhy: input.personalWhy,
        customerBio: input.customerBio,
        bioCompletedAt: new Date(),
        name,
        signatureName: input.displayName,
      },
      include: { dealership: { select: { name: true, settings: true } } },
    });

    await writeAuditLog({
      action: 'user.bio.update',
      targetType: 'user',
      targetId: updated.id,
      dealershipId: updated.dealershipId,
      actorUserId: actor.userId,
      metadata: { profileComplete: true },
      req,
    });

    return toPublicUser(updated);
  }
}
