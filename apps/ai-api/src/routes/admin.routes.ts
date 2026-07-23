import { Router, type Request } from 'express';
import { z } from 'zod';
import { MessageChannel, Prisma, Role } from '@prisma/client';
import { workflowRuleSchema } from '@drivecentric-ai/shared';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { unauthorized } from '../lib/errors.js';
import { UsageService } from '../services/usage.service.js';
import { writeAuditLog } from '../services/audit.service.js';

const router = Router();
const usage = new UsageService();
const currentExtensionVersion = (process.env.EXTENSION_LATEST_VERSION ?? '0.1.58').trim();

const promptTemplateSchema = z.object({
  key: z.string().min(2).max(120),
  name: z.string().min(2).max(180),
  content: z.string().min(1).max(20000),
  isActive: z.boolean().default(true),
});

const dealershipSettingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  dailyTokenLimit: z.number().int().positive().optional(),
  monthlyTokenLimit: z.number().int().positive().optional(),
  settings: z.record(z.unknown()).optional(),
  extensionMinVersion: z.string().min(1).optional(),
  extensionLatestVersion: z.string().min(1).optional(),
  supportEmail: z.string().email().nullable().optional(),
  globalAiKillSwitch: z.boolean().optional(),
});

function dateRange(req: Request) {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  return { from, to };
}

function clampLimit(value: unknown, fallback = 100, max = 500) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function parseMessageChannel(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toUpperCase();
  if (normalized === 'SMS') return MessageChannel.SMS;
  if (normalized === 'EMAIL') return MessageChannel.EMAIL;
  if (normalized === 'CRM_NOTE' || normalized === 'CRMNOTE') return MessageChannel.CRM_NOTE;
  return undefined;
}

router.use(requireAuth, requireRole('owner', 'manager'), requirePermission('canUseAdminDashboard'));

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const dealershipId = req.auth.dealershipId;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);

    const { from, to } = dateRange(req);
    const [users, activeUsers, flaggedMessages, usageToday, creditBalance, dealership, userActivity, featureUsage] = await Promise.all([
      prisma.user.count({ where: { dealershipId } }),
      prisma.user.count({ where: { dealershipId, status: 'ACTIVE' } }),
      prisma.messageLog.count({ where: { dealershipId, flagged: true } }),
      prisma.usageLog.aggregate({
        where: { dealershipId, day: since },
        _sum: { totalTokens: true, estimatedCostUsd: true },
        _count: { _all: true },
      }),
      prisma.user.aggregate({
        where: { dealershipId, role: { not: Role.OWNER } },
        _sum: { creditBalanceMicros: true },
      }),
      prisma.dealership.findUnique({ where: { id: dealershipId } }),
      usage.summarizeUserActivity(dealershipId, from, to),
      usage.summarizeFeatureUsage(dealershipId, from, to),
    ]);

    const reportedDealership = dealership
      ? {
          ...dealership,
          extensionLatestVersion: currentExtensionVersion,
        }
      : dealership;

    if (dealership && dealership.extensionLatestVersion !== currentExtensionVersion) {
      await prisma.dealership.update({
        where: { id: dealershipId },
        data: { extensionLatestVersion: currentExtensionVersion },
      });
    }

    res.json({
      users,
      activeUsers,
      flaggedMessages,
      aiEnabled: dealership?.aiEnabled ?? false,
      usageToday: {
        totalTokens: usageToday._sum.totalTokens ?? 0,
        estimatedCostUsd: Number(usageToday._sum.estimatedCostUsd ?? 0),
        requestCount: usageToday._count._all,
      },
      creditBalanceUsd: Number(((creditBalance._sum.creditBalanceMicros ?? 0) / 1_000_000).toFixed(2)),
      dealership: reportedDealership,
      topUsers: userActivity.slice(0, 8),
      topFeatures: featureUsage.slice(0, 8),
    });
  }),
);

router.get(
  '/usage',
  requirePermission('canViewUsage'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    res.json(await usage.summarizeByDay(req.auth.dealershipId, from, to, userId));
  }),
);

router.get(
  '/usage-detail',
  requirePermission('canViewUsage'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { from, to } = dateRange(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const [users, features] = await Promise.all([
      usage.summarizeUserActivity(req.auth.dealershipId, from, to),
      usage.summarizeFeatureUsage(req.auth.dealershipId, from, to, userId),
    ]);
    res.json({
      users: userId ? users.filter((user) => user.id === userId) : users,
      features,
    });
  }),
);

router.get(
  '/message-logs',
  requirePermission('canViewLogs'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const where: Prisma.MessageLogWhereInput = { dealershipId: req.auth.dealershipId };
    const channel = parseMessageChannel(req.query.channel);
    if (typeof req.query.userId === 'string') where.userId = req.query.userId;
    if (typeof req.query.action === 'string') where.action = req.query.action;
    if (channel) where.channel = channel;
    if (typeof req.query.flagged === 'string') where.flagged = req.query.flagged === 'true';
    const logs = await prisma.messageLog.findMany({
      where,
      select: {
        id: true,
        conversationId: true,
        channel: true,
        tone: true,
        action: true,
        output: true,
        evaluator: true,
        flagged: true,
        flags: true,
        leadContext: true,
        createdAt: true,
        user: { select: { id: true, name: true, userId: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: clampLimit(req.query.limit),
    });
    res.json(logs);
  }),
);

router.get(
  '/audit-logs',
  requirePermission('canViewLogs'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const logs = await prisma.auditLog.findMany({
      where: {
        dealershipId: req.auth.dealershipId,
        ...(typeof req.query.userId === 'string' ? { actorUserId: req.query.userId } : {}),
      },
      include: { actor: { select: { name: true, userId: true } } },
      orderBy: { createdAt: 'desc' },
      take: clampLimit(req.query.limit),
    });
    res.json(logs);
  }),
);

router.get(
  '/workflow-rules',
  requirePermission('canManageWorkflows'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(
      await prisma.workflowRule.findMany({
        where: { dealershipId: req.auth.dealershipId },
        orderBy: { sortOrder: 'asc' },
      }),
    );
  }),
);

router.post(
  '/workflow-rules',
  requirePermission('canManageWorkflows'),
  validateBody(workflowRuleSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const created = await prisma.workflowRule.upsert({
      where: { dealershipId_key: { dealershipId: req.auth.dealershipId, key: req.body.key } },
      create: {
        dealershipId: req.auth.dealershipId,
        key: req.body.key,
        title: req.body.title,
        config: req.body.config,
        isActive: req.body.isActive,
      },
      update: {
        title: req.body.title,
        config: req.body.config,
        isActive: req.body.isActive,
      },
    });
    await writeAuditLog({
      action: 'workflow.upsert',
      targetType: 'workflowRule',
      targetId: created.id,
      dealershipId: req.auth.dealershipId,
      actorUserId: req.auth.userId,
      metadata: { key: created.key },
      req,
    });
    res.status(201).json(created);
  }),
);

router.get(
  '/prompt-templates',
  requirePermission('canManagePrompts'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(
      await prisma.promptTemplate.findMany({
        where: { dealershipId: req.auth.dealershipId },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }),
);

router.post(
  '/prompt-templates',
  requirePermission('canManagePrompts'),
  validateBody(promptTemplateSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const created = await prisma.promptTemplate.upsert({
      where: { dealershipId_key: { dealershipId: req.auth.dealershipId, key: req.body.key } },
      create: {
        dealershipId: req.auth.dealershipId,
        key: req.body.key,
        name: req.body.name,
        content: req.body.content,
        isActive: req.body.isActive,
      },
      update: {
        name: req.body.name,
        content: req.body.content,
        isActive: req.body.isActive,
      },
    });
    await writeAuditLog({
      action: 'prompt.upsert',
      targetType: 'promptTemplate',
      targetId: created.id,
      dealershipId: req.auth.dealershipId,
      actorUserId: req.auth.userId,
      metadata: { key: created.key },
      req,
    });
    res.status(201).json(created);
  }),
);

router.get(
  '/settings',
  requirePermission('canManageSettings'),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const [dealership, globalKillSwitch] = await Promise.all([
      prisma.dealership.findUnique({ where: { id: req.auth.dealershipId } }),
      prisma.systemSetting.findUnique({ where: { key: 'GLOBAL_AI_KILL_SWITCH' } }),
    ]);
    res.json({
      dealership,
      globalAiKillSwitch: Boolean((globalKillSwitch?.value as { enabled?: boolean } | undefined)?.enabled),
    });
  }),
);

router.patch(
  '/settings',
  requireRole('owner'),
  requirePermission('canManageSettings'),
  validateBody(dealershipSettingsSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = req.body as z.infer<typeof dealershipSettingsSchema>;
    const data: Prisma.DealershipUpdateInput = {};
    if (input.aiEnabled !== undefined) data.aiEnabled = input.aiEnabled;
    if (input.dailyTokenLimit !== undefined) data.dailyTokenLimit = input.dailyTokenLimit;
    if (input.monthlyTokenLimit !== undefined) data.monthlyTokenLimit = input.monthlyTokenLimit;
    if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;
    if (input.extensionMinVersion !== undefined) data.extensionMinVersion = input.extensionMinVersion;
    if (input.extensionLatestVersion !== undefined) data.extensionLatestVersion = input.extensionLatestVersion;
    if (input.supportEmail !== undefined) data.supportEmail = input.supportEmail;

    const [dealership] = await Promise.all([
      prisma.dealership.update({
        where: { id: req.auth.dealershipId },
        data,
      }),
      input.globalAiKillSwitch === undefined
        ? Promise.resolve()
        : prisma.systemSetting.upsert({
            where: { key: 'GLOBAL_AI_KILL_SWITCH' },
            create: { key: 'GLOBAL_AI_KILL_SWITCH', value: { enabled: input.globalAiKillSwitch } },
            update: { value: { enabled: input.globalAiKillSwitch } },
          }),
    ]);

    await writeAuditLog({
      action: 'settings.update',
      targetType: 'dealership',
      targetId: dealership.id,
      dealershipId: req.auth.dealershipId,
      actorUserId: req.auth.userId,
      metadata: { fields: Object.keys(input) },
      req,
    });
    res.json(dealership);
  }),
);

export { router as adminRoutes };
