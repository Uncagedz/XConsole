import type {
  AiFeedbackRequest,
  AiGenerateRequest,
  AiGenerateResponse,
  AuthResponse,
  BillingQuoteResponse,
  InventorySearchResponse,
  LeadContext,
  LeadTimelineActor,
  QuotaStatus,
  Vehicle,
} from '@drivecentric-ai/shared';

export interface AuthStatusResponse {
  authenticated: boolean;
  user?: AuthResponse['user'];
  apiBaseUrl?: string;
}

export interface ExtensionConfigResponse {
  apiBaseUrl: string;
}

export interface ReadPageResponse {
  conversationId: string;
  context: LeadContext;
  isLeadPage: boolean;
  pageTitle: string;
  url: string;
  xconsoleSuggestions?: Vehicle[];
}

export interface ReadInventoryResponse {
  url: string;
  vehicles: InventorySearchResponse['vehicles'];
}

export type FumbleRiskLevel = 'medium' | 'high' | 'critical';
export type FumbleQueueStatus = 'open' | 'snoozed' | 'resolved';

export interface FumbleQueueItem {
  id: string;
  conversationId: string;
  pageUrl: string;
  customerName?: string;
  vehicleOfInterest?: string;
  customerLocation?: string;
  phoneNumber?: string;
  lastCustomerMessage?: string;
  lastSeenAt: string;
  firstSeenAt: string;
  dueAt: string;
  riskLevel: FumbleRiskLevel;
  reason: string;
  nextStepHint: string;
  status: FumbleQueueStatus;
  waitingOn?: 'salesperson' | 'customer' | 'none';
  lastActor?: LeadTimelineActor;
  lastActivityLabel?: string;
  lastCustomerLabel?: string;
  lastSalespersonLabel?: string;
  lastCustomerAt?: string;
  lastSalespersonAt?: string;
  snoozedUntil?: string;
  lastInboundAt?: string;
}

export interface FumbleQueueResponse {
  items: FumbleQueueItem[];
  alertCount: number;
  overdueCount: number;
}

export interface AiFeedbackResponse {
  ok: boolean;
  learned: boolean;
}

export interface BillingCreditResponse {
  ok: boolean;
  userId: string;
  creditBalanceMicros: number;
  creditBalanceUsd: number;
  quote: BillingQuoteResponse;
}

export type ExtensionRequest =
  | { type: 'AUTH_STATUS' }
  | { type: 'USAGE_QUOTA' }
  | { type: 'AUTH_LOGIN'; userId: string; password: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AI_GENERATE'; payload: AiGenerateRequest }
  | { type: 'AI_FEEDBACK'; payload: AiFeedbackRequest }
  | { type: 'BILLING_RECHARGE'; amountDollars: number }
  | { type: 'BILLING_TRANSFER'; targetUserId: string; amountDollars: number }
  | { type: 'INVENTORY_SEARCH'; query: string; limit?: number }
  | { type: 'READ_PAGE' }
  | { type: 'INSERT_INTO_PAGE'; text: string }
  | { type: 'MIC_START' }
  | { type: 'MIC_STOP' }
  | { type: 'MIC_WINDOW_OPEN' }
  | { type: 'FUMBLE_QUEUE_GET' }
  | { type: 'FUMBLE_QUEUE_SYNC'; page: ReadPageResponse }
  | { type: 'FUMBLE_QUEUE_RESOLVE'; conversationId: string }
  | { type: 'FUMBLE_QUEUE_SNOOZE'; conversationId: string; minutes?: number }
  | { type: 'CONFIG_GET' }
  | { type: 'CONFIG_SET'; apiBaseUrl: string };

export type ContentScriptRequest =
  | { type: 'CONTENT_READ_PAGE' }
  | { type: 'CONTENT_READ_PAGE_V2' }
  | { type: 'CONTENT_INSERT_TEXT'; text: string }
  | { type: 'CONTENT_READ_INVENTORY' };

export type ExtensionResponse =
  | {
      ok: true;
      data:
        | AuthResponse
        | AuthResponse['user']
        | AiFeedbackResponse
        | AiGenerateResponse
        | BillingCreditResponse
        | BillingQuoteResponse
        | InventorySearchResponse
        | QuotaStatus
        | AuthStatusResponse
        | ExtensionConfigResponse
        | ReadPageResponse
        | ReadInventoryResponse
        | FumbleQueueResponse
        | { started: boolean }
        | { stopped: boolean; transcript: string }
        | { opened: boolean }
        | { inserted: boolean };
    }
  | { ok: false; error: string };

export function sendExtensionMessage<T>(message: ExtensionRequest): Promise<T> {
  return chrome.runtime.sendMessage(message).then((response: ExtensionResponse) => {
    if (!response.ok) throw new Error(response.error);
    return response.data as T;
  });
}
