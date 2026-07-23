import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  CREDIT_MICROS_PER_USD,
  CUSTOMER_DOLLARS_PER_APP_CREDIT_DOLLAR,
  creditBalanceView,
  quoteCredit,
} from '../src/services/billing.service.js';

describe('billing credit ratio', () => {
  it('converts customer payment to app credit at 15 to 1', () => {
    const quote = quoteCredit(15, Role.SALESPERSON);

    expect(CUSTOMER_DOLLARS_PER_APP_CREDIT_DOLLAR).toBe(15);
    expect(quote.amountDollars).toBe(15);
    expect(quote.creditMicros).toBe(CREDIT_MICROS_PER_USD);
    expect(quote.creditUsd).toBe(1);
    expect(quote.customerDollarsPerAppCreditDollar).toBe(15);
  });

  it('converts a five dollar payment to one third of a dollar of app credit', () => {
    const quote = quoteCredit(5, Role.BDC);

    expect(quote.creditMicros).toBe(333_333);
    expect(quote.creditUsd).toBeCloseTo(0.333333, 6);
  });

  it('estimates remaining usage from actual app credit balance', () => {
    const quote = quoteCredit(15, Role.SALESPERSON);
    const balance = creditBalanceView({
      role: Role.SALESPERSON,
      creditBalanceMicros: CREDIT_MICROS_PER_USD,
    });

    expect(balance.creditBalanceUsd).toBe(1);
    expect(balance.estimatedCreditRequestsRemaining).toBe(quote.estimatedRequests);
    expect(balance.estimatedCreditTokensRemaining).toBe(quote.estimatedTokens);
  });
});
