import type { NextFunction, Request, Response } from 'express';
import { UserStatus } from '@prisma/client';
import type { Role } from '@drivecentric-ai/shared';
import type { UserPermission } from '@drivecentric-ai/shared';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { toPublicRole } from '../domain/mappers.js';
import { hasPermission } from '../domain/permissions.js';

function canAuthenticate(status: UserStatus) {
  return status === UserStatus.ACTIVE || status === UserStatus.PASSWORD_RESET_REQUIRED;
}

function isJwtAuthError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError')
  );
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) {
      throw unauthorized();
    }

    const claims = verifyAccessToken(token);
    const [user, session] = await Promise.all([
      prisma.user.findUnique({
        where: { id: claims.sub },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          dealershipId: true,
          dealership: {
            select: {
              isActive: true,
            },
          },
        },
      }),
      prisma.session.findUnique({
        where: { id: claims.sessionId },
        select: {
          revokedAt: true,
          expiresAt: true,
        },
      }),
    ]);

    if (!user || !session || session.revokedAt || session.expiresAt <= new Date()) {
      throw unauthorized('Session expired');
    }

    if (!canAuthenticate(user.status) || !user.dealership.isActive) {
      throw forbidden('User is not active');
    }

    req.auth = {
      userId: user.id,
      appUserId: user.userId,
      role: toPublicRole(user.role),
      dealershipId: user.dealershipId,
      sessionId: claims.sessionId,
    };
    next();
  } catch (error) {
    next(isJwtAuthError(error) ? unauthorized() : error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }

    if (!roles.includes(req.auth.role)) {
      next(forbidden());
      return;
    }

    next();
  };
}

export function requirePermission(permission: UserPermission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth) throw unauthorized();
      const user = await prisma.user.findUnique({
        where: { id: req.auth.userId },
        select: { role: true, permissions: true },
      });
      if (!user || !hasPermission(user, permission)) {
        throw forbidden('Insufficient permissions');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
