import { Role, UserStatus } from '@prisma/client';
import {
  defaultAccessibleProfileRolesForRole,
  loginRequestSchema,
  refreshRequestSchema,
  USER_PERMISSIONS,
} from '@drivecentric-ai/shared';
import { defaultWorkflowConfig } from '@drivecentric-ai/config';
import { prisma } from '../lib/prisma.js';
import { ApiError, forbidden, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  createRefreshToken,
  hashRefreshToken,
  parseRefreshToken,
  refreshExpiryDate,
  signAccessToken,
} from '../lib/tokens.js';
import { toPublicRole, toPublicUser } from '../domain/mappers.js';
import { writeAuditLog } from './audit.service.js';
import { UsageService } from './usage.service.js';
import type { Request } from 'express';

const ownerLoginBootstrapKey = 'OWNER_LOGIN_BOOTSTRAP_COMPLETED';

function canAuthenticate(status: UserStatus) {
  return status === UserStatus.ACTIVE || status === UserStatus.PASSWORD_RESET_REQUIRED;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isBootstrapHost() {
  return Boolean(
    process.env.NODE_ENV === 'production' ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_NAME ||
      process.env.RAILWAY_PROJECT_ID,
  );
}

function seedDealershipSettings() {
  const dealershipLocation = {
    address: (process.env.SEED_DEALERSHIP_ADDRESS ?? '777 N State Road 7').trim(),
    city: (process.env.SEED_DEALERSHIP_CITY ?? 'Plantation').trim(),
    state: (process.env.SEED_DEALERSHIP_STATE ?? 'FL').trim(),
    zipCode: (process.env.SEED_DEALERSHIP_ZIP ?? '33317').trim(),
  };
  return {
    ...defaultWorkflowConfig,
    dealershipLocation,
  };
}

async function maybeBootstrapOwnerLogin(input: { userId: string; password: string }) {
  const requestedUserId = input.userId.trim();
  const configuredOwnerUserId = (process.env.SEED_OWNER_USER_ID ?? 'owner').trim();
  const ownerUserId = requestedUserId.toLowerCase() === 'owner' ? 'owner' : configuredOwnerUserId;
  const allowedOwnerUserIds = new Set(['owner', configuredOwnerUserId.toLowerCase()]);
  const allowedBootstrapPasswords = new Set(
    [process.env.SEED_OWNER_PASSWORD?.trim(), 'Pass1'].filter((password): password is string => Boolean(password)),
  );
  if (!isBootstrapHost() || !allowedOwnerUserIds.has(requestedUserId.toLowerCase())) return null;
  if (!allowedBootstrapPasswords.has(input.password)) return null;

  const completed = await prisma.systemSetting.findUnique({ where: { key: ownerLoginBootstrapKey } });
  if (completed) return null;

  const dealershipName = (process.env.SEED_DEALERSHIP_NAME ?? 'Taverna CDJRF').trim();
  const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'workwithanirudhs@gmail.com').trim();
  const dealershipSlug = slugify(dealershipName);
  const settings = seedDealershipSettings();
  const extensionLatestVersion = (process.env.EXTENSION_LATEST_VERSION ?? '0.1.58').trim();
  const dealership = await prisma.dealership.upsert({
    where: { slug: dealershipSlug },
    create: {
      name: dealershipName,
      slug: dealershipSlug,
      settings,
      extensionLatestVersion,
      supportEmail: ownerEmail,
    },
    update: {
      settings,
      extensionLatestVersion,
      supportEmail: ownerEmail,
      isActive: true,
    },
  });
  const existingEmailUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
  const safeOwnerEmail =
    !existingEmailUser || existingEmailUser.userId.toLowerCase() === ownerUserId.toLowerCase()
      ? ownerEmail
      : `${ownerUserId}.${dealership.id}@bootstrap.local`;

  const passwordHash = await hashPassword(input.password);
  await prisma.user.upsert({
    where: { userId: ownerUserId },
    create: {
      userId: ownerUserId,
      email: safeOwnerEmail,
      name: 'Owner Admin',
      signatureName: 'Ani',
      signatureDealershipName: dealershipName,
      passwordHash,
      role: Role.OWNER,
      status: UserStatus.ACTIVE,
      dealershipId: dealership.id,
      aiEnabled: true,
      permissions: [...USER_PERMISSIONS],
      accessibleProfileRoles: defaultAccessibleProfileRolesForRole('owner'),
      dailyRequestLimit: null,
      bonusDailyRequestLimit: 0,
      monthlyRequestLimit: null,
      dailyTokenLimit: null,
      creditBalanceMicros: 0,
      freeCreditGrantedMicros: 0,
      lifetimeCreditMicros: 0,
    },
    update: {
      email: safeOwnerEmail,
      name: 'Owner Admin',
      signatureName: 'Ani',
      signatureDealershipName: dealershipName,
      passwordHash,
      role: Role.OWNER,
      status: UserStatus.ACTIVE,
      dealershipId: dealership.id,
      aiEnabled: true,
      permissions: [...USER_PERMISSIONS],
      accessibleProfileRoles: defaultAccessibleProfileRolesForRole('owner'),
      dailyRequestLimit: null,
      bonusDailyRequestLimit: 0,
      monthlyRequestLimit: null,
      dailyTokenLimit: null,
      creditBalanceMicros: 0,
      freeCreditGrantedMicros: 0,
      lifetimeCreditMicros: 0,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: ownerLoginBootstrapKey },
    create: {
      key: ownerLoginBootstrapKey,
      value: { completedAt: new Date().toISOString(), ownerUserId },
    },
    update: {
      value: { completedAt: new Date().toISOString(), ownerUserId },
    },
  });

  return prisma.user.findFirst({
    where: { userId: { equals: ownerUserId, mode: 'insensitive' } },
    include: { dealership: true },
  });
}

export class AuthService {
  private readonly usage = new UsageService();

  async login(rawInput: unknown, req?: Request) {
    let step = 'parse_input';
    try {
      const input = loginRequestSchema.parse(rawInput);
      step = 'load_user';
      let user = await prisma.user.findFirst({
        where: { userId: { equals: input.userId.trim(), mode: 'insensitive' } },
        include: { dealership: true },
      });
      step = 'verify_password';
      let passwordMatches = false;
      if (user) {
        try {
          passwordMatches = await verifyPassword(user.passwordHash, input.password);
        } catch (error) {
          console.warn('Stored password hash verification failed; bootstrap recovery may repair owner login.', error);
        }
      }

      if (!passwordMatches) {
        step = 'bootstrap_owner';
        user = await maybeBootstrapOwnerLogin(input);
        passwordMatches = Boolean(user);
      }

      if (!user || !passwordMatches) {
        throw unauthorized('Invalid user ID or password');
      }

      step = 'check_user_status';
      if (!canAuthenticate(user.status) || !user.dealership.isActive) {
        throw forbidden('User is not active');
      }

      step = 'create_session';
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: 'pending',
          userAgent: req?.header('user-agent') ?? null,
          ip: req?.ip ?? null,
          expiresAt: refreshExpiryDate(),
        },
      });

      step = 'update_session';
      const refreshToken = createRefreshToken(session.id);
      await prisma.session.update({
        where: { id: session.id },
        data: { refreshTokenHash: hashRefreshToken(refreshToken) },
      });

      step = 'update_last_login';
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      step = 'write_audit_log';
      await writeAuditLog({
        action: 'auth.login',
        targetType: 'user',
        targetId: user.id,
        dealershipId: user.dealershipId,
        actorUserId: user.id,
        req,
      });

      step = 'build_auth_response';
      return {
        accessToken: signAccessToken({
          sub: user.id,
          userId: user.userId,
          role: toPublicRole(user.role),
          dealershipId: user.dealershipId,
          sessionId: session.id,
        }),
        refreshToken,
        user: toPublicUser(user),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error(`Auth login failed during ${step}`, error);
      throw new ApiError(500, 'auth_login_failed', `Login failed during ${step}`);
    }
  }

  async refresh(rawInput: unknown, req?: Request) {
    const { refreshToken } = refreshRequestSchema.parse(rawInput);
    const { sessionId } = parseRefreshToken(refreshToken);
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            dealership: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.refreshTokenHash !== hashRefreshToken(refreshToken)
    ) {
      throw unauthorized('Refresh token expired');
    }

    if (!canAuthenticate(session.user.status) || !session.user.dealership.isActive) {
      throw forbidden('User is not active');
    }

    const rotatedRefreshToken = createRefreshToken(session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashRefreshToken(rotatedRefreshToken),
        expiresAt: refreshExpiryDate(),
        userAgent: req?.header('user-agent') ?? null,
        ip: req?.ip ?? null,
      },
    });

    return {
      accessToken: signAccessToken({
        sub: session.user.id,
        userId: session.user.userId,
        role: toPublicRole(session.user.role),
        dealershipId: session.user.dealershipId,
        sessionId: session.id,
      }),
      refreshToken: rotatedRefreshToken,
      user: toPublicUser(session.user),
    };
  }

  async me(actor: NonNullable<Request['auth']>) {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      include: { dealership: true },
    });

    if (!user || !canAuthenticate(user.status) || !user.dealership.isActive) {
      throw unauthorized('Session expired');
    }

    return toPublicUser(user);
  }

  async quota(actor: NonNullable<Request['auth']>) {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      include: { dealership: true },
    });

    if (!user || !canAuthenticate(user.status) || !user.dealership.isActive) {
      throw unauthorized('Session expired');
    }

    return this.usage.quotaForUser(user);
  }

  async logout(refreshToken: string | undefined, req?: Request) {
    if (!refreshToken) {
      return { ok: true };
    }

    const { sessionId } = parseRefreshToken(refreshToken);
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await writeAuditLog({
        action: 'auth.logout',
        targetType: 'session',
        targetId: session.id,
        actorUserId: session.userId,
        req,
      });
    }
    return { ok: true };
  }

  async resetPassword(userId: string, password: string) {
    const passwordHash = await hashPassword(password);
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash, status: UserStatus.PASSWORD_RESET_REQUIRED },
    });
  }
}
