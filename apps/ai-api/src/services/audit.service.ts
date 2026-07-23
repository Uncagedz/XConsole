import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string | undefined;
  dealershipId?: string | undefined;
  actorUserId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  req?: Request | undefined;
}

export async function writeAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      dealershipId: input.dealershipId ?? null,
      actorUserId: input.actorUserId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ip: input.req?.ip ?? null,
      userAgent: input.req?.header('user-agent') ?? null,
    },
  });
}
