import { CreditLedgerType, Prisma, Role, type Dealership, type User } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden } from '../lib/errors.js';
import { BillingService, creditBalanceView } from './billing.service.js';

export interface UsageRecordInput {
  dealershipId: string;
  userId: string;
  conversationId: string;
  requestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface FeatureBucket {
  key: string;
  label: string;
  category: 'action' | 'channel' | 'tone';
  count: number;
  users: Set<string>;
  conversations: Set<string>;
  flaggedCount: number;
  lastUsedAt: Date | undefined;
}

interface TimingAccumulator {
  customerReplyMinutes: number[];
  repReplyMinutes: number[];
  customerHours: Map<number, number>;
  seen: Set<string>;
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function mostCommon<T extends string | number>(items: T[]) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function formatKey(value: string | undefined) {
  return (value ?? 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function collectTiming(leadContext: Prisma.JsonValue | null | undefined, timing: TimingAccumulator) {
  const timeline = jsonRecord(leadContext).conversationTimeline;
  if (!Array.isArray(timeline)) return;

  const entries = timeline
    .map((entry, index) => {
      const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
      const actor = typeof record.actor === 'string' ? record.actor : 'unknown';
      const direction = typeof record.direction === 'string' ? record.direction : 'unknown';
      const text = typeof record.text === 'string' ? record.text.replace(/\s+/g, ' ').trim() : '';
      const timestampIso = typeof record.timestampIso === 'string' ? record.timestampIso : '';
      const timestamp = timestampIso ? Date.parse(timestampIso) : Number.NaN;
      return { actor, direction, text, timestampIso, timestamp, index };
    })
    .filter((entry) => !Number.isNaN(entry.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index);

  let lastCustomer: (typeof entries)[number] | undefined;
  let lastHumanOutbound: (typeof entries)[number] | undefined;

  for (const entry of entries) {
    const isCustomer = entry.actor === 'customer' || entry.direction === 'inbound';
    const isHumanOutbound =
      entry.direction === 'outbound' && (entry.actor === 'salesperson' || entry.actor === 'manager');
    const dedupeKey = `${entry.timestampIso}:${entry.actor}:${entry.direction}:${entry.text.slice(0, 80)}`;
    if (timing.seen.has(dedupeKey)) continue;
    timing.seen.add(dedupeKey);

    if (isCustomer) {
      const hour = new Date(entry.timestamp).getHours();
      timing.customerHours.set(hour, (timing.customerHours.get(hour) ?? 0) + 1);
      if (lastHumanOutbound) {
        const minutes = (entry.timestamp - lastHumanOutbound.timestamp) / 60000;
        if (minutes > 0 && minutes < 14 * 24 * 60) timing.customerReplyMinutes.push(Math.round(minutes * 10) / 10);
      }
      lastCustomer = entry;
    }

    if (isHumanOutbound) {
      if (lastCustomer) {
        const minutes = (entry.timestamp - lastCustomer.timestamp) / 60000;
        if (minutes > 0 && minutes < 14 * 24 * 60) timing.repReplyMinutes.push(Math.round(minutes * 10) / 10);
      }
      lastHumanOutbound = entry;
    }
  }
}

function timingSummary(timing: TimingAccumulator) {
  const customerHour = [...timing.customerHours.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return {
    avgCustomerReplyMinutes: average(timing.customerReplyMinutes),
    avgRepReplyMinutes: average(timing.repReplyMinutes),
    usualCustomerHour:
      customerHour === undefined ? undefined : `${String(customerHour).padStart(2, '0')}:00-${String((customerHour + 1) % 24).padStart(2, '0')}:00`,
  };
}

function emptyTiming(): TimingAccumulator {
  return {
    customerReplyMinutes: [],
    repReplyMinutes: [],
    customerHours: new Map<number, number>(),
    seen: new Set<string>(),
  };
}

function dayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function withBonus(limit: number | null, bonus: number | null | undefined) {
  return limit === null ? null : limit + Math.max(0, bonus ?? 0);
}

function remaining(limit: number | null, used: number) {
  return limit === null ? null : Math.max(0, limit - used);
}

async function getGlobalKillSwitch() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'GLOBAL_AI_KILL_SWITCH' },
  });
  const value = setting?.value as { enabled?: boolean } | undefined;
  return Boolean(value?.enabled);
}

export class UsageService {
  private readonly billing = new BillingService();

  async assertAiAllowed(user: User & { dealership: Dealership }) {
    if (await getGlobalKillSwitch()) {
      throw forbidden('AI access is disabled globally');
    }

    if (user.status !== UserStatus.ACTIVE || !user.aiEnabled) {
      throw forbidden('AI access is disabled for this user');
    }

    if (!user.dealership.isActive || !user.dealership.aiEnabled) {
      throw forbidden('AI access is disabled for this dealership');
    }

    if (user.role === Role.OWNER) {
      return;
    }

    if (user.creditBalanceMicros <= 0) {
      throw forbidden('AI credit balance is empty. Recharge credits to continue.');
    }

    const quota = await this.quotaForUser(user);
    if (quota.dailyTokenLimit !== null && quota.dailyTokensUsed >= quota.dailyTokenLimit) {
      throw forbidden('This user has reached the daily token limit.');
    }
    if (quota.storeDailyTokenLimit !== null && quota.storeDailyTokensUsed >= quota.storeDailyTokenLimit) {
      throw forbidden('The dealership has reached the daily token limit.');
    }
    if (quota.storeMonthlyTokenLimit !== null && quota.storeMonthlyTokensUsed >= quota.storeMonthlyTokenLimit) {
      throw forbidden('The dealership has reached the monthly token limit.');
    }

    return;
  }

  async quotaForUser(user: User & { dealership: Dealership }) {
    const since = dayStart();
    const monthSince = monthStart();
    const [userDaily, userMonthlyRequests, dealershipDaily, dealershipMonthly] = await Promise.all([
      prisma.usageLog.aggregate({
        where: { userId: user.id, day: since },
        _sum: { totalTokens: true },
        _count: { _all: true },
      }),
      prisma.usageLog.count({
        where: { userId: user.id, createdAt: { gte: monthSince } },
      }),
      prisma.usageLog.aggregate({
        where: { dealershipId: user.dealershipId, day: since },
        _sum: { totalTokens: true },
      }),
      prisma.usageLog.aggregate({
        where: { dealershipId: user.dealershipId, createdAt: { gte: monthSince } },
        _sum: { totalTokens: true },
      }),
    ]);

    const isUnlimited = user.role === Role.OWNER;
    const dailyRequestsUsed = userDaily._count._all;
    const dailyTokensUsed = userDaily._sum.totalTokens ?? 0;
    const storeDailyTokensUsed = dealershipDaily._sum.totalTokens ?? 0;
    const storeMonthlyTokensUsed = dealershipMonthly._sum.totalTokens ?? 0;
    const dailyRequestLimit = null;
    const monthlyRequestLimit = null;
    const dailyTokenLimit = isUnlimited ? null : user.dailyTokenLimit;
    const storeDailyTokenLimit = isUnlimited ? null : user.dealership.dailyTokenLimit;
    const storeMonthlyTokenLimit = isUnlimited ? null : user.dealership.monthlyTokenLimit;

    return {
      isUnlimited,
      dailyRequestsUsed,
      dailyRequestLimit,
      bonusDailyRequestLimit: 0,
      dailyRequestsRemaining: null,
      monthlyRequestsUsed: userMonthlyRequests,
      monthlyRequestLimit,
      monthlyRequestsRemaining: null,
      dailyTokensUsed,
      dailyTokenLimit,
      dailyTokensRemaining: remaining(dailyTokenLimit, dailyTokensUsed),
      storeDailyTokensUsed,
      storeDailyTokenLimit,
      storeDailyTokensRemaining: remaining(storeDailyTokenLimit, storeDailyTokensUsed),
      storeMonthlyTokensUsed,
      storeMonthlyTokenLimit,
      storeMonthlyTokensRemaining: remaining(storeMonthlyTokenLimit, storeMonthlyTokensUsed),
      ...creditBalanceView(user),
      refreshedAt: new Date().toISOString(),
    };
  }

  estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
    const lowerModel = model.toLowerCase();
    const inputPerToken = lowerModel.includes('mini') ? 0.0000004 : 0.000005;
    const outputPerToken = lowerModel.includes('mini') ? 0.0000016 : 0.000015;
    return Number((inputTokens * inputPerToken + outputTokens * outputPerToken).toFixed(6));
  }

  async record(input: UsageRecordInput) {
    const log = await prisma.usageLog.create({
      data: {
        dealershipId: input.dealershipId,
        userId: input.userId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        estimatedCostUsd: new Prisma.Decimal(input.estimatedCostUsd),
        day: dayStart(),
      },
    });
    await this.billing.recordUsageDebit(input);
    return log;
  }

  async summarizeByDay(dealershipId: string, from: Date, to: Date, userId?: string) {
    const rows = await prisma.usageLog.groupBy({
      by: ['day', 'dealershipId', 'userId'],
      where: {
        dealershipId,
        ...(userId ? { userId } : {}),
        day: {
          gte: dayStart(from),
          lte: dayStart(to),
        },
      },
      _sum: {
        totalTokens: true,
        estimatedCostUsd: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        day: 'asc',
      },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(new Set(rows.map((row) => row.userId))) } },
      select: { id: true, name: true, userId: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      dealershipId: row.dealershipId,
      userId: row.userId,
      userName: userById.get(row.userId)?.name,
      userUserId: userById.get(row.userId)?.userId,
      totalTokens: row._sum.totalTokens ?? 0,
      estimatedCostUsd: Number(row._sum.estimatedCostUsd ?? 0),
      requestCount: row._count._all,
    }));
  }

  async summarizeUserActivity(dealershipId: string, from: Date, to: Date) {
    const [users, usageRows, messageRows, creditRows] = await Promise.all([
      prisma.user.findMany({
        where: { dealershipId },
        select: {
          id: true,
          userId: true,
          name: true,
          role: true,
          status: true,
          aiEnabled: true,
          dailyRequestLimit: true,
          bonusDailyRequestLimit: true,
          monthlyRequestLimit: true,
          dailyTokenLimit: true,
          accessibleProfileRoles: true,
          creditBalanceMicros: true,
          freeCreditGrantedMicros: true,
          lifetimeCreditMicros: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.usageLog.findMany({
        where: { dealershipId, createdAt: { gte: from, lte: to } },
        select: {
          userId: true,
          conversationId: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCostUsd: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      prisma.messageLog.findMany({
        where: { dealershipId, createdAt: { gte: from, lte: to } },
        select: {
          userId: true,
          conversationId: true,
          action: true,
          channel: true,
          tone: true,
          flagged: true,
          flags: true,
          leadContext: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      prisma.creditLedger.groupBy({
        by: ['userId', 'type'],
        where: { dealershipId },
        _sum: {
          amountMicros: true,
          costMicros: true,
          profitMicros: true,
        },
      }),
    ]);

    const creditByUser = new Map<
      string,
      {
        creditAddedMicros: number;
        creditSpentMicros: number;
        providerCostMicros: number;
        grossProfitMicros: number;
      }
    >();
    for (const row of creditRows) {
      const totals =
        creditByUser.get(row.userId) ??
        {
          creditAddedMicros: 0,
          creditSpentMicros: 0,
          providerCostMicros: 0,
          grossProfitMicros: 0,
        };
      const amountMicros = row._sum.amountMicros ?? 0;
      if (row.type === CreditLedgerType.USAGE_DEBIT) {
        totals.creditSpentMicros += Math.abs(amountMicros);
        totals.providerCostMicros += row._sum.costMicros ?? 0;
        totals.grossProfitMicros += row._sum.profitMicros ?? 0;
      } else if (amountMicros > 0) {
        totals.creditAddedMicros += amountMicros;
      }
      creditByUser.set(row.userId, totals);
    }

    return users
      .map((user) => {
        const userUsage = usageRows.filter((row) => row.userId === user.id);
        const userMessages = messageRows.filter((row) => row.userId === user.id);
        const conversations = new Set([
          ...userUsage.map((row) => row.conversationId),
          ...userMessages.map((row) => row.conversationId),
        ]);
        const timing = emptyTiming();
        for (const row of userMessages) collectTiming(row.leadContext, timing);
        const actions = userMessages.map((row) => row.action);
        const channels = userMessages.map((row) => row.channel);
        const tones = userMessages.map((row) => row.tone);
        const models = userUsage.map((row) => row.model);
        const creditTotals = creditByUser.get(user.id);
        const lastActivity = [...userUsage.map((row) => row.createdAt), ...userMessages.map((row) => row.createdAt)].sort(
          (left, right) => right.getTime() - left.getTime(),
        )[0];

        return {
          id: user.id,
          userId: user.userId,
          name: user.name,
          role: user.role.toLowerCase(),
          status: user.status.toLowerCase(),
          aiEnabled: user.aiEnabled,
          dailyRequestLimit: user.dailyRequestLimit,
          bonusDailyRequestLimit: 0,
          monthlyRequestLimit: user.monthlyRequestLimit,
          dailyTokenLimit: user.dailyTokenLimit,
          ...creditBalanceView(user),
          creditAddedUsd: Number(((creditTotals?.creditAddedMicros ?? 0) / 1_000_000).toFixed(2)),
          creditSpentUsd: Number(((creditTotals?.creditSpentMicros ?? 0) / 1_000_000).toFixed(2)),
          providerCostUsd: Number(((creditTotals?.providerCostMicros ?? 0) / 1_000_000).toFixed(4)),
          grossProfitUsd: Number(((creditTotals?.grossProfitMicros ?? 0) / 1_000_000).toFixed(4)),
          requestCount: userUsage.length,
          messageCount: userMessages.length,
          conversations: conversations.size,
          totalTokens: userUsage.reduce((sum, row) => sum + row.totalTokens, 0),
          inputTokens: userUsage.reduce((sum, row) => sum + row.inputTokens, 0),
          outputTokens: userUsage.reduce((sum, row) => sum + row.outputTokens, 0),
          estimatedCostUsd: Number(
            userUsage.reduce((sum, row) => sum + Number(row.estimatedCostUsd), 0).toFixed(6),
          ),
          flaggedCount: userMessages.filter((row) => row.flagged).length,
          topAction: formatKey(mostCommon(actions)),
          topChannel: formatKey(mostCommon(channels)),
          topTone: formatKey(mostCommon(tones)),
          topModel: mostCommon(models) ?? 'none',
          lastActivityAt: lastActivity?.toISOString(),
          ...timingSummary(timing),
        };
      })
      .sort((left, right) => {
        const activityDiff = right.requestCount + right.messageCount - (left.requestCount + left.messageCount);
        if (activityDiff !== 0) return activityDiff;
        return left.name.localeCompare(right.name);
      });
  }

  async summarizeFeatureUsage(dealershipId: string, from: Date, to: Date, userId?: string) {
    const rows = await prisma.messageLog.findMany({
      where: { dealershipId, ...(userId ? { userId } : {}), createdAt: { gte: from, lte: to } },
      select: {
        userId: true,
        conversationId: true,
        action: true,
        channel: true,
        tone: true,
        flagged: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const features = new Map<string, FeatureBucket>();

    function add(category: 'action' | 'channel' | 'tone', value: string, row: (typeof rows)[number]) {
      const key = `${category}:${value}`;
      const current =
        features.get(key) ??
        {
          key,
          label: `${formatKey(category)}: ${formatKey(value)}`,
          category,
          count: 0,
          users: new Set<string>(),
          conversations: new Set<string>(),
          flaggedCount: 0,
          lastUsedAt: undefined,
        };
      current.count += 1;
      current.users.add(row.userId);
      current.conversations.add(row.conversationId);
      if (row.flagged) current.flaggedCount += 1;
      if (!current.lastUsedAt || row.createdAt > current.lastUsedAt) current.lastUsedAt = row.createdAt;
      features.set(key, current);
    }

    for (const row of rows) {
      add('action', row.action, row);
      add('channel', row.channel, row);
      add('tone', row.tone, row);
    }

    return [...features.values()]
      .map((feature) => ({
        key: feature.key,
        label: feature.label,
        category: feature.category,
        count: feature.count,
        users: feature.users.size,
        conversations: feature.conversations.size,
        flaggedCount: feature.flaggedCount,
        lastUsedAt: feature.lastUsedAt?.toISOString(),
      }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }
}
