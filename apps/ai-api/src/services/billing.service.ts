import { CreditLedgerType, Prisma, Role, type User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';
import type { Request } from 'express';

export const CREDIT_MICROS_PER_USD = 1_000_000;
export const CUSTOMER_DOLLARS_PER_APP_CREDIT_DOLLAR = 15;
export const FREE_SELLING_CREDIT_MICROS = CREDIT_MICROS_PER_USD;
export const SALESPERSON_MARKUP = 3.5;
export const MANAGER_MARKUP = 4.5;
const DEFAULT_REQUEST_INPUT_TOKENS = 1800;
const DEFAULT_REQUEST_OUTPUT_TOKENS = 400;
const MINI_INPUT_COST_PER_TOKEN_USD = 0.0000004;
const MINI_OUTPUT_COST_PER_TOKEN_USD = 0.0000016;

type UserRole = Role | 'owner' | 'manager' | 'bdc' | 'salesperson';

function publicRole(role: UserRole) {
  return String(role).toLowerCase();
}

function roundMicros(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.ceil(value));
}

function microsToUsd(micros: number) {
  return Number((micros / CREDIT_MICROS_PER_USD).toFixed(6));
}

function paymentDollarsToCreditMicros(amountDollars: number) {
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    throw badRequest('Recharge amount must be greater than $0.');
  }
  if (amountDollars > 1000) {
    throw badRequest('Recharge amount cannot be more than $1,000 at once.');
  }
  return Math.round((amountDollars / CUSTOMER_DOLLARS_PER_APP_CREDIT_DOLLAR) * CREDIT_MICROS_PER_USD);
}

function balanceDollarsToMicros(amountDollars: number) {
  if (!Number.isFinite(amountDollars) || amountDollars < 0) {
    throw badRequest('Credit balance must be $0 or greater.');
  }
  if (amountDollars > 1000) {
    throw badRequest('Credit balance cannot be more than $1,000.');
  }
  return Math.round(amountDollars * CREDIT_MICROS_PER_USD);
}

function estimateCreditCapacity(creditMicros: number, role: UserRole) {
  const markup = markupMultiplierForRole(role) || SALESPERSON_MARKUP;
  const providerCostCapacityMicros = Math.floor(Math.max(creditMicros, 0) / markup);
  const estimatedProviderCostPerRequestUsd =
    DEFAULT_REQUEST_INPUT_TOKENS * MINI_INPUT_COST_PER_TOKEN_USD +
    DEFAULT_REQUEST_OUTPUT_TOKENS * MINI_OUTPUT_COST_PER_TOKEN_USD;
  const sellingMicrosPerEstimatedRequest = sellMicrosForProviderCost(estimatedProviderCostPerRequestUsd, role);
  const estimatedRequests = sellingMicrosPerEstimatedRequest
    ? Math.floor(Math.max(creditMicros, 0) / sellingMicrosPerEstimatedRequest)
    : null;
  const blendedTokenCostUsd =
    estimatedProviderCostPerRequestUsd / (DEFAULT_REQUEST_INPUT_TOKENS + DEFAULT_REQUEST_OUTPUT_TOKENS);
  const estimatedTokens = Math.floor((providerCostCapacityMicros / CREDIT_MICROS_PER_USD) / blendedTokenCostUsd);

  return {
    markup,
    providerCostCapacityMicros,
    estimatedRequests,
    estimatedTokens,
  };
}

export function markupMultiplierForRole(role: UserRole) {
  const normalized = publicRole(role);
  if (normalized === 'owner') return 0;
  if (normalized === 'manager') return MANAGER_MARKUP;
  return SALESPERSON_MARKUP;
}

export function markupBpsForRole(role: UserRole) {
  return Math.round(markupMultiplierForRole(role) * 10_000);
}

export function sellMicrosForProviderCost(estimatedCostUsd: number, role: UserRole) {
  const markup = markupMultiplierForRole(role);
  if (markup <= 0) return 0;
  return roundMicros(estimatedCostUsd * markup * CREDIT_MICROS_PER_USD);
}

export function costMicrosFromUsd(estimatedCostUsd: number) {
  return roundMicros(estimatedCostUsd * CREDIT_MICROS_PER_USD);
}

export function quoteCredit(amountDollars: number, role: UserRole) {
  const creditMicros = paymentDollarsToCreditMicros(amountDollars);
  const capacity = estimateCreditCapacity(creditMicros, role);

  return {
    amountDollars,
    creditMicros,
    creditUsd: microsToUsd(creditMicros),
    customerDollarsPerAppCreditDollar: CUSTOMER_DOLLARS_PER_APP_CREDIT_DOLLAR,
    role: publicRole(role),
    markupMultiplier: capacity.markup,
    providerCostCapacityUsd: microsToUsd(capacity.providerCostCapacityMicros),
    estimatedRequests: capacity.estimatedRequests,
    estimatedTokens: capacity.estimatedTokens,
  };
}

export function creditBalanceView(user: Pick<User, 'role' | 'creditBalanceMicros'>) {
  const markup = markupMultiplierForRole(user.role);
  const capacity = estimateCreditCapacity(user.creditBalanceMicros, user.role);
  const estimatedRequests = user.creditBalanceMicros > 0 ? capacity.estimatedRequests : 0;
  const estimatedTokens = user.creditBalanceMicros > 0 ? capacity.estimatedTokens : 0;
  return {
    creditBalanceMicros: user.role === Role.OWNER ? null : user.creditBalanceMicros,
    creditBalanceUsd: user.role === Role.OWNER ? null : microsToUsd(user.creditBalanceMicros),
    billingMarkupMultiplier: user.role === Role.OWNER ? null : markup,
    estimatedCreditRequestsRemaining: user.role === Role.OWNER ? null : estimatedRequests,
    estimatedCreditTokensRemaining: user.role === Role.OWNER ? null : estimatedTokens,
  };
}

async function scopedTarget(actor: NonNullable<Request['auth']>, targetUserId: string | undefined) {
  const id = targetUserId ?? actor.userId;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('User not found');
  if (actor.role !== 'owner' && user.dealershipId !== actor.dealershipId) throw forbidden();
  return user;
}

export class BillingService {
  quote(amountDollars: number, role: UserRole) {
    return quoteCredit(amountDollars, role);
  }

  async recharge(actor: NonNullable<Request['auth']>, rawInput: unknown, req?: Request) {
    if (actor.role !== 'owner') {
      throw forbidden('Only the owner can add or edit paid credits.');
    }
    const input = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, unknown>) : {};
    const amountDollars = Number(input.amountDollars);
    const creditMicros = paymentDollarsToCreditMicros(amountDollars);
    const targetUserId = typeof input.targetUserId === 'string' && input.targetUserId ? input.targetUserId : undefined;
    const note = typeof input.note === 'string' ? input.note.slice(0, 300) : undefined;
    const target = await scopedTarget(actor, targetUserId);
    if (target.role === Role.OWNER) throw badRequest('Owner accounts are unlimited and do not need recharge credits.');

    const quote = quoteCredit(amountDollars, target.role);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.creditLedger.create({
        data: {
          dealershipId: target.dealershipId,
          userId: target.id,
          actorUserId: actor.userId,
          type: CreditLedgerType.RECHARGE,
          amountMicros: creditMicros,
          costMicros: 0,
          profitMicros: creditMicros,
          markupBps: markupBpsForRole(target.role),
          note: note ?? `Recharge payment $${amountDollars.toFixed(2)} for $${quote.creditUsd.toFixed(2)} app credit`,
          metadata: { quote },
        },
      });
      return tx.user.update({
        where: { id: target.id },
        data: {
          creditBalanceMicros: { increment: creditMicros },
          lifetimeCreditMicros: { increment: creditMicros },
        },
      });
    });

    await writeAuditLog({
      action: 'billing.recharge',
      targetType: 'user',
      targetId: target.id,
      dealershipId: target.dealershipId,
      actorUserId: actor.userId,
      metadata: { amountDollars, creditMicros },
      req,
    });

    return {
      ok: true,
      userId: updated.id,
      creditBalanceMicros: updated.creditBalanceMicros,
      creditBalanceUsd: microsToUsd(updated.creditBalanceMicros),
      quote,
    };
  }

  async transfer(actor: NonNullable<Request['auth']>, rawInput: unknown, req?: Request) {
    if (actor.role !== 'owner') {
      throw forbidden('Only the owner can transfer or edit paid credits.');
    }
    const input = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, unknown>) : {};
    const amountDollars = Number(input.amountDollars);
    const creditMicros = paymentDollarsToCreditMicros(amountDollars);
    const targetUserId = typeof input.targetUserId === 'string' && input.targetUserId ? input.targetUserId : '';
    const note = typeof input.note === 'string' ? input.note.slice(0, 300) : undefined;
    if (!targetUserId) throw badRequest('Target user is required.');
    const [actorUser, target] = await Promise.all([
      prisma.user.findUnique({ where: { id: actor.userId } }),
      scopedTarget(actor, targetUserId),
    ]);
    if (!actorUser) throw notFound('Actor user not found');
    if (target.role === Role.OWNER) throw badRequest('Owner accounts are unlimited and do not need credits.');
    if (actorUser.role !== Role.OWNER) throw forbidden('Only the owner can transfer or edit paid credits.');

    const quote = quoteCredit(amountDollars, target.role);
    const updatedTarget = await prisma.$transaction(async (tx) => {
      if (actorUser.role !== Role.OWNER) {
        await tx.user.update({
          where: { id: actorUser.id },
          data: { creditBalanceMicros: { decrement: creditMicros } },
        });
        await tx.creditLedger.create({
          data: {
            dealershipId: actorUser.dealershipId,
            userId: actorUser.id,
            actorUserId: actorUser.id,
            type: CreditLedgerType.TRANSFER_OUT,
            amountMicros: -creditMicros,
            note: note ?? `Distributed payment $${amountDollars.toFixed(2)} as $${quote.creditUsd.toFixed(2)} app credit to ${target.userId}`,
            metadata: { targetUserId: target.id },
          },
        });
      }
      await tx.creditLedger.create({
        data: {
          dealershipId: target.dealershipId,
          userId: target.id,
          actorUserId: actor.userId,
          type: CreditLedgerType.TRANSFER_IN,
          amountMicros: creditMicros,
          costMicros: 0,
          profitMicros: actorUser.role === Role.OWNER ? creditMicros : 0,
          markupBps: markupBpsForRole(target.role),
          note: note ?? `Credit transfer payment $${amountDollars.toFixed(2)} for $${quote.creditUsd.toFixed(2)} app credit`,
          metadata: { quote, sourceUserId: actorUser.id },
        },
      });
      return tx.user.update({
        where: { id: target.id },
        data: {
          creditBalanceMicros: { increment: creditMicros },
          lifetimeCreditMicros: { increment: creditMicros },
        },
      });
    });

    await writeAuditLog({
      action: 'billing.transfer',
      targetType: 'user',
      targetId: target.id,
      dealershipId: target.dealershipId,
      actorUserId: actor.userId,
      metadata: { amountDollars, creditMicros },
      req,
    });

    return {
      ok: true,
      userId: updatedTarget.id,
      creditBalanceMicros: updatedTarget.creditBalanceMicros,
      creditBalanceUsd: microsToUsd(updatedTarget.creditBalanceMicros),
      quote,
    };
  }

  async setBalance(actor: NonNullable<Request['auth']>, rawInput: unknown, req?: Request) {
    if (actor.role !== 'owner') {
      throw forbidden('Only the owner can reset user credits.');
    }
    const input = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, unknown>) : {};
    const targetUserId = typeof input.targetUserId === 'string' && input.targetUserId ? input.targetUserId : '';
    const amountDollars = Number(input.amountDollars);
    const nextBalanceMicros = balanceDollarsToMicros(amountDollars);
    const note = typeof input.note === 'string' ? input.note.slice(0, 300) : undefined;
    if (!targetUserId) throw badRequest('Target user is required.');
    const target = await scopedTarget(actor, targetUserId);
    if (target.role === Role.OWNER) throw badRequest('Owner accounts are unlimited and do not use credit balances.');

    const deltaMicros = nextBalanceMicros - target.creditBalanceMicros;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.creditLedger.create({
        data: {
          dealershipId: target.dealershipId,
          userId: target.id,
          actorUserId: actor.userId,
          type: CreditLedgerType.ADJUSTMENT,
          amountMicros: deltaMicros,
          costMicros: 0,
          profitMicros: Math.max(0, deltaMicros),
          markupBps: markupBpsForRole(target.role),
          note: note ?? `Credit balance reset to $${microsToUsd(nextBalanceMicros).toFixed(2)}`,
          metadata: {
            previousBalanceMicros: target.creditBalanceMicros,
            nextBalanceMicros,
            deltaMicros,
          },
        },
      });
      return tx.user.update({
        where: { id: target.id },
        data: { creditBalanceMicros: nextBalanceMicros },
      });
    });

    await writeAuditLog({
      action: 'billing.set_balance',
      targetType: 'user',
      targetId: target.id,
      dealershipId: target.dealershipId,
      actorUserId: actor.userId,
      metadata: { amountDollars, previousBalanceMicros: target.creditBalanceMicros, nextBalanceMicros, deltaMicros },
      req,
    });

    return {
      ok: true,
      userId: updated.id,
      previousCreditBalanceMicros: target.creditBalanceMicros,
      previousCreditBalanceUsd: microsToUsd(target.creditBalanceMicros),
      creditBalanceMicros: updated.creditBalanceMicros,
      creditBalanceUsd: microsToUsd(updated.creditBalanceMicros),
      deltaMicros,
      deltaUsd: microsToUsd(deltaMicros),
      quote: quoteCredit(Math.max(amountDollars * CUSTOMER_DOLLARS_PER_APP_CREDIT_DOLLAR, 0.01), target.role),
    };
  }

  async status(actor: NonNullable<Request['auth']>) {
    const user = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw notFound('User not found');
    const ledger = await prisma.creditLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      ...creditBalanceView(user),
      lifetimeCreditMicros: user.role === Role.OWNER ? null : user.lifetimeCreditMicros,
      freeCreditGrantedMicros: user.role === Role.OWNER ? null : user.freeCreditGrantedMicros,
      ledger: ledger.map((entry) => ({
        id: entry.id,
        type: entry.type.toLowerCase(),
        amountMicros: entry.amountMicros,
        amountUsd: microsToUsd(entry.amountMicros),
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  async recordUsageDebit(input: {
    dealershipId: string;
    userId: string;
    requestId: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.role === Role.OWNER) return { sellMicros: 0, costMicros: 0 };

    const sellMicros = sellMicrosForProviderCost(input.estimatedCostUsd, user.role);
    const costMicros = costMicrosFromUsd(input.estimatedCostUsd);
    if (!sellMicros) return { sellMicros: 0, costMicros };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { creditBalanceMicros: { decrement: sellMicros } },
      });
      await tx.creditLedger.create({
        data: {
          dealershipId: input.dealershipId,
          userId: input.userId,
          type: CreditLedgerType.USAGE_DEBIT,
          amountMicros: -sellMicros,
          costMicros,
          profitMicros: Math.max(0, sellMicros - costMicros),
          markupBps: markupBpsForRole(user.role),
          requestId: input.requestId,
          note: `AI usage ${input.model}`,
          metadata: {
            provider: input.provider,
            model: input.model,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            totalTokens: input.totalTokens,
          } satisfies Prisma.InputJsonObject,
        },
      });
    });

    return { sellMicros, costMicros };
  }
}
