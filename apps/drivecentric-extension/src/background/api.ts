import type {
  AiFeedbackRequest,
  AiGenerateRequest,
  AiGenerateResponse,
  AuthResponse,
  BillingQuoteResponse,
  InventorySearchResponse,
  LeadContextIngest,
  QuotaStatus,
  Vehicle,
} from '@drivecentric-ai/shared';
import type { ReadPageResponse } from '../shared/messages';
import { getApiBaseUrl, getAuth, requireApiBaseUrl, setApiBaseUrl, setAuth } from './storage';

async function apiBaseUrl() {
  return requireApiBaseUrl();
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        details?: {
          fieldErrors?: Record<string, string[]>;
          issues?: Array<{ path?: Array<string | number>; message?: string }>;
        };
      };
    };
    const base = body.error?.message ?? 'Request failed';
    const fieldErrors = body.error?.details?.fieldErrors;
    if (fieldErrors) {
      const details = Object.entries(fieldErrors)
        .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
        .join('; ');
      return details ? `${base}: ${details}` : base;
    }
    const issues = body.error?.details?.issues;
    if (issues?.length) {
      return `${base}: ${issues.map((issue) => `${issue.path?.join('.') || 'field'}: ${issue.message}`).join('; ')}`;
    }
    return base === 'Request failed'
      ? `Team server request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
      : base;
  } catch {
    return `Team server request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`;
  }
}

async function request(path: string, init: RequestInit) {
  const baseUrl = await apiBaseUrl();
  try {
    return await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new Error(`Cannot reach the XConsole AI service at ${baseUrl}. Check the connection and try again.`);
  }
}

async function refreshAuth(auth: AuthResponse) {
  const response = await request('/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });

  if (!response.ok) {
    await setAuth(null);
    throw new Error(await parseError(response));
  }

  const refreshed = (await response.json()) as AuthResponse;
  await setAuth(refreshed);
  return refreshed;
}

async function apiFetch<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const auth = await getAuth();
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (auth?.accessToken) headers.set('authorization', `Bearer ${auth.accessToken}`);

  const response = await request(path, {
    ...init,
    headers,
  });

  if (response.status === 401 && retry && auth) {
    await refreshAuth(auth);
    return apiFetch<T>(path, init, false);
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

async function freshUser(auth: AuthResponse) {
  const user = await apiFetch<AuthResponse['user']>('/auth/me', { method: 'GET' });
  const updated = { ...auth, user };
  await setAuth(updated);
  return updated;
}

export async function login(userId: string, password: string) {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const auth = (await response.json()) as AuthResponse;
  await setAuth(auth);
  return auth;
}

export async function logout() {
  const auth = await getAuth();
  if (auth) {
    await request('/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    }).catch(() => undefined);
  }
  await setAuth(null);
  return { authenticated: false };
}

export async function authStatus() {
  const auth = await getAuth();
  if (!auth) return { authenticated: false, apiBaseUrl: await getApiBaseUrl() };

  try {
    const updated = await freshUser(auth);
    return { authenticated: true, user: updated.user, apiBaseUrl: await getApiBaseUrl() };
  } catch {
    await setAuth(null);
    return { authenticated: false, apiBaseUrl: await getApiBaseUrl() };
  }
}

export async function quotaStatus() {
  return apiFetch<QuotaStatus>('/auth/quota', { method: 'GET' });
}

export async function generate(payload: AiGenerateRequest) {
  return apiFetch<AiGenerateResponse>('/ai/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function recordFeedback(payload: AiFeedbackRequest) {
  return apiFetch<{ ok: boolean; learned: boolean }>('/ai/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function inventorySearch(query: string, limit = 9) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('limit', String(limit));
  return apiFetch<InventorySearchResponse>(`/inventory/search?${params.toString()}`, {
    method: 'GET',
  });
}

function toXConsoleContext(page: ReadPageResponse): LeadContextIngest {
  const context = page.context;
  const candidate = context.vehicleOfInterestDetails;
  const extractedAt = context.extractedAt ?? new Date().toISOString();
  return {
    source: 'drivecentric',
    conversationId: page.conversationId,
    customer: {
      ...(context.customerName ? { name: context.customerName } : {}),
      ...(context.phoneNumbers?.[0] ? { phone: context.phoneNumbers[0] } : {}),
      ...(context.emails?.[0] ? { email: context.emails[0] } : {}),
    },
    ...(context.vehicleOfInterest || candidate
      ? {
          vehicleInterest: {
            ...(candidate?.vin?.match(/^[A-HJ-NPR-Z0-9]{17}$/i) ? { vin: candidate.vin.toUpperCase() } : {}),
            ...(context.stockNumber || candidate?.stock ? { stockNumber: context.stockNumber ?? candidate?.stock } : {}),
            ...(context.vehicleOfInterest ? { description: context.vehicleOfInterest } : {}),
          },
        }
      : {}),
    conversation: (context.conversationTimeline ?? [])
      .filter((entry) => entry.text?.trim())
      .map((entry) => ({
        direction: entry.direction,
        channel: entry.channel,
        ...(entry.speakerName ? { sender: entry.speakerName } : {}),
        body: entry.text?.trim() ?? '',
        sentAt: entry.timestampIso ?? extractedAt,
      })),
    extractedAt,
    rawContext: {
      pageUrl: page.url,
      pageTitle: page.pageTitle,
      leadSource: context.leadSource,
      appointmentStatus: context.appointmentStatus,
      customerIntelligence: context.customerIntelligence,
      parserDebug: context.parserDebug,
    },
  };
}

export async function syncXConsoleContext(page: ReadPageResponse) {
  return apiFetch<{ ok: boolean; suggestions: Vehicle[] }>('/xconsole/context', {
    method: 'POST',
    body: JSON.stringify(toXConsoleContext(page)),
  });
}

export async function rechargeCredits(amountDollars: number) {
  return apiFetch<{ ok: boolean; userId: string; creditBalanceMicros: number; creditBalanceUsd: number; quote: BillingQuoteResponse }>(
    '/billing/recharge',
    {
      method: 'POST',
      body: JSON.stringify({ amountDollars }),
    },
  );
}

export async function transferCredits(targetUserId: string, amountDollars: number) {
  return apiFetch<{ ok: boolean; userId: string; creditBalanceMicros: number; creditBalanceUsd: number; quote: BillingQuoteResponse }>(
    '/billing/transfer',
    {
      method: 'POST',
      body: JSON.stringify({ targetUserId, amountDollars }),
    },
  );
}

export async function getConfig() {
  return { apiBaseUrl: await getApiBaseUrl() };
}

export async function setConfig(apiBaseUrlValue: string) {
  return { apiBaseUrl: await setApiBaseUrl(apiBaseUrlValue) };
}
