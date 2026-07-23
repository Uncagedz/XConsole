import type { AuthResponse, LeadTimelineActor, LeadTimelineEntry } from '@drivecentric-ai/shared';
import type { FumbleQueueItem, FumbleQueueResponse, ReadPageResponse } from '../shared/messages';
import { getAuth } from './storage';

const FUMBLE_QUEUE_KEY = 'drivecentric_ai_fumble_queue_v1';
const FUMBLE_ALARM = 'drivecentric-ai-fumble-risk-check';

type PersistedQueueItem = FumbleQueueItem & { lastAlertAt?: string };
type PersistedQueueState = Record<string, PersistedQueueItem[]>;
export interface ConversationState {
  hasTimeline: boolean;
  lastActor?: LeadTimelineActor;
  waitingOn: 'salesperson' | 'customer' | 'none';
  needsReply: boolean;
  lastActivityLabel?: string;
  lastCustomerAt?: string;
  lastCustomerLabel?: string;
  lastCustomerText?: string;
  lastSalespersonAt?: string;
  lastSalespersonLabel?: string;
}

function can(user: AuthResponse['user'] | undefined, permission: 'canUseFumbleQueue' | 'canReceiveFumbleAlerts') {
  return user?.role === 'owner' || Boolean(user?.permissions?.includes(permission));
}

function stableId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `fumble-${hash.toString(16)}`;
}

function compact(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim();
}

function snippet(value: string | undefined | null, max = 180) {
  const normalized = compact(value);
  if (!normalized) return undefined;
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function iso(date: Date) {
  return date.toISOString();
}

function addMinutes(timestamp: string, minutes: number) {
  const next = new Date(timestamp);
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
}

function parseTimestamp(line: string | undefined, now = new Date()) {
  const value = compact(line);
  if (!value) return undefined;
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();

  const timeMatch = value.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (!timeMatch) return undefined;

  const hours = Number(timeMatch[1] ?? '0');
  const minutes = Number(timeMatch[2] ?? '0');
  const meridiem = (timeMatch[3] ?? 'AM').toUpperCase();
  const date = new Date(now);
  date.setSeconds(0, 0);
  let normalizedHours = hours % 12;
  if (meridiem === 'PM') normalizedHours += 12;
  date.setHours(normalizedHours, minutes, 0, 0);

  if (/yesterday/i.test(value)) {
    date.setDate(date.getDate() - 1);
    return iso(date);
  }

  const dayMatch = value.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  if (dayMatch) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const target = dayNames.findIndex((item) => item.toLowerCase() === dayMatch[1]!.toLowerCase());
    if (target >= 0) {
      const delta = (date.getDay() - target + 7) % 7;
      date.setDate(date.getDate() - delta);
      return iso(date);
    }
  }

  return iso(date);
}

function latestInboundAt(page: ReadPageResponse) {
  const timestamps = [...(page.context.timestamps ?? [])].reverse();
  for (const line of timestamps) {
    const parsed = parseTimestamp(line);
    if (parsed) return parsed;
  }
  return undefined;
}

function resolvedByContext(page: ReadPageResponse) {
  const appointment = compact(page.context.appointmentStatus) ?? '';
  const fullText = compact(page.context.visibleText) ?? '';
  return /sold|delivered|dead|do not contact|dnc|unsubscribe|opt out|wrong number/i.test(`${appointment}\n${fullText}`);
}

function latestCustomerMessage(page: ReadPageResponse) {
  const latest = [...(page.context.priorMessages ?? [])]
    .reverse()
    .find((message) => {
      const normalized = compact(message);
      if (!normalized) return false;
      if (/claire|genius summary|type your note here|video task|phone task|planned/i.test(normalized)) return false;
      return normalized.length > 10;
    });
  return snippet(latest ?? page.context.visibleText, 220);
}

function relevantTimeline(page: ReadPageResponse) {
  return (page.context.conversationTimeline ?? []).filter((entry) => entry.text || entry.timestampLabel || entry.speakerName);
}

function compareTimelineEntries(left: LeadTimelineEntry & { index: number }, right: LeadTimelineEntry & { index: number }) {
  if (left.timestampIso && right.timestampIso) {
    return new Date(right.timestampIso).getTime() - new Date(left.timestampIso).getTime();
  }
  if (left.timestampIso && !right.timestampIso) return -1;
  if (!left.timestampIso && right.timestampIso) return 1;
  return left.index - right.index;
}

function latestTimelineEntry(
  entries: Array<LeadTimelineEntry & { index: number }>,
  predicate: (entry: LeadTimelineEntry & { index: number }) => boolean,
) {
  return entries.filter(predicate).sort(compareTimelineEntries)[0];
}

function newerThan(left: LeadTimelineEntry & { index: number }, right: LeadTimelineEntry & { index: number }) {
  if (left.timestampIso && right.timestampIso) {
    return new Date(left.timestampIso).getTime() > new Date(right.timestampIso).getTime();
  }
  if (left.timestampIso && !right.timestampIso) return true;
  if (!left.timestampIso && right.timestampIso) return false;
  return left.index < right.index;
}

function humanOutbound(entry: LeadTimelineEntry) {
  return (entry.actor === 'salesperson' || entry.actor === 'manager') && entry.direction === 'outbound';
}

export function deriveConversationState(page: ReadPageResponse): ConversationState {
  const entries = relevantTimeline(page).map((entry, index) => ({ ...entry, index }));
  if (!entries.length) {
    return {
      hasTimeline: false,
      waitingOn: 'none',
      needsReply: false,
    };
  }

  const lastEntry = entries.sort(compareTimelineEntries)[0];
  const lastCustomer = latestTimelineEntry(entries, (entry) => entry.actor === 'customer' && entry.direction === 'inbound');
  const lastSalesperson = latestTimelineEntry(entries, (entry) => humanOutbound(entry));
  const waitingOn =
    lastCustomer && (!lastSalesperson || newerThan(lastCustomer, lastSalesperson))
      ? 'salesperson'
      : lastSalesperson
        ? 'customer'
        : 'none';
  const lastCustomerText = lastCustomer?.text ? snippet(lastCustomer.text, 220) : undefined;

  return {
    hasTimeline: true,
    waitingOn,
    needsReply: waitingOn === 'salesperson',
    ...(lastEntry?.actor ? { lastActor: lastEntry.actor } : {}),
    ...(lastEntry?.timestampLabel ? { lastActivityLabel: lastEntry.timestampLabel } : {}),
    ...(lastCustomer?.timestampIso ? { lastCustomerAt: lastCustomer.timestampIso } : {}),
    ...(lastCustomer?.timestampLabel ? { lastCustomerLabel: lastCustomer.timestampLabel } : {}),
    ...(lastCustomerText ? { lastCustomerText } : {}),
    ...(lastSalesperson?.timestampIso ? { lastSalespersonAt: lastSalesperson.timestampIso } : {}),
    ...(lastSalesperson?.timestampLabel ? { lastSalespersonLabel: lastSalesperson.timestampLabel } : {}),
  };
}

function riskOrder(level: FumbleQueueItem['riskLevel']) {
  if (level === 'critical') return 3;
  if (level === 'high') return 2;
  return 1;
}

function nextStepHint(page: ReadPageResponse) {
  if (page.context.appointmentStatus?.match(/appointment|show|visit/i)) {
    return 'Confirm the appointment and lock the time.';
  }
  if (page.context.tradeInfo) return 'Ask for VIN, miles, payoff, and condition, then choose the next step from the customer context.';
  if (page.context.paymentBudgetHints) return 'Answer the numbers question cleanly and move to verified numbers or a finance review only if relevant.';
  if (page.context.customerLocation?.match(/\bFL\b|Florida|Plantation|Davie|Sunrise|Miami|Doral|Broward/i)) {
    return 'Answer first and make a local visit easy only if the customer is ready.';
  }
  return 'Answer the question, reduce friction, and ask one light next question based on the current customer message.';
}

function reasonForRisk(level: FumbleQueueItem['riskLevel'], page: ReadPageResponse, dueAt: string) {
  const conversation = deriveConversationState(page);
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const customerLabel = conversation.lastCustomerLabel ? ` from ${conversation.lastCustomerLabel}` : '';
  if (level === 'critical') {
    const overdueMinutes = Math.max(1, Math.round((now - due) / 60000));
    if (conversation.needsReply) {
      return `${page.context.customerName ?? 'Customer'} replied${customerLabel} and is now about ${overdueMinutes} minute${overdueMinutes === 1 ? '' : 's'} past the 30-minute response window.`;
    }
    return `This lead is past the 30-minute response window by about ${overdueMinutes} minute${overdueMinutes === 1 ? '' : 's'}.`;
  }
  if (level === 'high') {
    if (conversation.needsReply) {
      return `${page.context.customerName ?? 'Customer'} spoke${customerLabel}. A salesperson reply is still owed.`;
    }
    if (page.context.leadScore === 'hot') return 'Hot lead with active buying intent and no locked next step yet.';
    return 'Fresh customer activity needs a response soon to avoid a fumble.';
  }
  if (conversation.needsReply) return 'Customer activity is live and still waiting on the salesperson side.';
  return 'Lead activity is live. Keep it from going cold.';
}

function assessRiskLevel(page: ReadPageResponse, dueAt: string) {
  const conversation = deriveConversationState(page);
  const text = compact([conversation.lastCustomerText, latestCustomerMessage(page), page.context.paymentBudgetHints, page.context.tradeInfo, page.context.visibleText].filter(Boolean).join('\n')) ?? '';
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const minutesToDue = Math.round((due - now) / 60000);
  const urgent = /today|asap|right now|call me|available\?|still available|price|payment|trade|credit|lease|quote|numbers/i.test(text);

  if (minutesToDue <= 0) return 'critical';
  if (minutesToDue <= 10 || page.context.leadScore === 'hot' || urgent || conversation.needsReply) return 'high';
  return 'medium';
}

function buildQueueItem(page: ReadPageResponse, existing?: PersistedQueueItem): PersistedQueueItem | null {
  if (resolvedByContext(page)) return null;
  if (!page.isLeadPage && !page.context.customerName && !page.context.vehicleOfInterest) return null;

  const conversation = deriveConversationState(page);
  if (conversation.hasTimeline && !conversation.needsReply) return null;

  const lastMessage = conversation.lastCustomerText ?? latestCustomerMessage(page);
  if (!lastMessage) return null;

  const now = new Date().toISOString();
  const inboundAt = conversation.lastCustomerAt ?? latestInboundAt(page) ?? existing?.lastInboundAt ?? now;
  const dueAt = existing?.lastInboundAt === inboundAt && existing?.dueAt ? existing.dueAt : addMinutes(inboundAt, 30);
  const riskLevel = assessRiskLevel(page, dueAt);

  return {
    id: existing?.id ?? stableId(`${page.conversationId}|${page.url}`),
    conversationId: page.conversationId,
    pageUrl: page.url,
    ...(page.context.customerName ? { customerName: page.context.customerName } : {}),
    ...(page.context.vehicleOfInterest ? { vehicleOfInterest: page.context.vehicleOfInterest } : {}),
    ...(page.context.customerLocation ? { customerLocation: page.context.customerLocation } : {}),
    ...(page.context.phoneNumbers?.[0] ? { phoneNumber: page.context.phoneNumbers[0] } : {}),
    ...(lastMessage ? { lastCustomerMessage: lastMessage } : {}),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    dueAt,
    riskLevel,
    reason: reasonForRisk(riskLevel, page, dueAt),
    nextStepHint: nextStepHint(page),
    status: existing?.status === 'resolved' ? 'open' : existing?.status ?? 'open',
    waitingOn: conversation.waitingOn,
    ...(conversation.lastActor ? { lastActor: conversation.lastActor } : {}),
    ...(conversation.lastActivityLabel ? { lastActivityLabel: conversation.lastActivityLabel } : {}),
    ...(conversation.lastCustomerLabel ? { lastCustomerLabel: conversation.lastCustomerLabel } : {}),
    ...(conversation.lastSalespersonLabel ? { lastSalespersonLabel: conversation.lastSalespersonLabel } : {}),
    ...(conversation.lastCustomerAt ? { lastCustomerAt: conversation.lastCustomerAt } : {}),
    ...(conversation.lastSalespersonAt ? { lastSalespersonAt: conversation.lastSalespersonAt } : {}),
    ...(existing?.snoozedUntil ? { snoozedUntil: existing.snoozedUntil } : {}),
    ...(inboundAt ? { lastInboundAt: inboundAt } : {}),
    ...(existing?.lastAlertAt ? { lastAlertAt: existing.lastAlertAt } : {}),
  };
}

async function readQueueState() {
  const result = await chrome.storage.local.get(FUMBLE_QUEUE_KEY);
  return (result[FUMBLE_QUEUE_KEY] as PersistedQueueState | undefined) ?? {};
}

async function writeQueueState(state: PersistedQueueState) {
  await chrome.storage.local.set({ [FUMBLE_QUEUE_KEY]: state });
}

function activeItems(items: PersistedQueueItem[]) {
  const now = Date.now();
  return items.filter((item) => {
    if (item.status === 'resolved') return false;
    if (item.status === 'snoozed' && item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now) return false;
    return true;
  });
}

function summarize(items: PersistedQueueItem[]): FumbleQueueResponse {
  const current = activeItems(items)
    .sort((left, right) => {
      const byRisk = riskOrder(right.riskLevel) - riskOrder(left.riskLevel);
      if (byRisk !== 0) return byRisk;
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    })
    .slice(0, 12);

  return {
    items: current,
    alertCount: current.filter((item) => item.riskLevel !== 'medium').length,
    overdueCount: current.filter((item) => item.riskLevel === 'critical').length,
  };
}

async function setBadge(items: PersistedQueueItem[]) {
  const count = activeItems(items).filter((item) => item.riskLevel !== 'medium').length;
  await chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#E34F5F' : '#3A4740' });
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : '' });
}

async function scheduleAlarm(items: PersistedQueueItem[]) {
  const open = activeItems(items);
  if (!open.length) {
    await chrome.alarms.clear(FUMBLE_ALARM);
    return;
  }

  const nextDue = open
    .map((item) => new Date(item.dueAt).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];

  if (!nextDue) return;
  const delayInMinutes = Math.max(0.2, (nextDue - Date.now()) / 60000);
  await chrome.alarms.create(FUMBLE_ALARM, { delayInMinutes });
}

async function maybeNotify(user: AuthResponse['user'], item: PersistedQueueItem, existing?: PersistedQueueItem) {
  if (!can(user, 'canReceiveFumbleAlerts')) return item;
  const existingAlert = existing?.lastAlertAt ? new Date(existing.lastAlertAt).getTime() : 0;
  const lastAlertAgo = Date.now() - existingAlert;
  const riskRaised = !existing || riskOrder(item.riskLevel) > riskOrder(existing.riskLevel);

  if (item.riskLevel === 'medium') return item;
  if (!riskRaised && lastAlertAgo < 10 * 60 * 1000) return item;

  await chrome.notifications.create(item.id, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: item.riskLevel === 'critical' ? 'Fumble risk overdue' : 'Fumble risk rising',
    message: `${item.customerName ?? 'Lead'}: ${item.reason}`,
    priority: item.riskLevel === 'critical' ? 2 : 1,
  });

  return { ...item, lastAlertAt: new Date().toISOString() };
}

async function queueForUser(userId: string) {
  const state = await readQueueState();
  return { state, items: state[userId] ?? [] };
}

export async function getFumbleQueue() {
  const auth = await getAuth();
  if (!auth?.user || !can(auth.user, 'canUseFumbleQueue')) return { items: [], alertCount: 0, overdueCount: 0 };
  const { items } = await queueForUser(auth.user.id);
  await setBadge(items);
  await scheduleAlarm(items);
  return summarize(items);
}

export async function syncFumbleQueue(page: ReadPageResponse) {
  const auth = await getAuth();
  if (!auth?.user || !can(auth.user, 'canUseFumbleQueue')) return { items: [], alertCount: 0, overdueCount: 0 };

  const { state, items } = await queueForUser(auth.user.id);
  const existing = items.find((item) => item.conversationId === page.conversationId);
  const next = buildQueueItem(page, existing);

  let updatedItems = items.filter((item) => item.conversationId !== page.conversationId);

  if (next) {
    updatedItems.push(await maybeNotify(auth.user, next, existing));
  }

  updatedItems = updatedItems
    .filter((item) => item.status !== 'resolved')
    .sort((left, right) => new Date(left.lastSeenAt).getTime() - new Date(right.lastSeenAt).getTime())
    .slice(-30);

  state[auth.user.id] = updatedItems;
  await writeQueueState(state);
  await setBadge(updatedItems);
  await scheduleAlarm(updatedItems);
  return summarize(updatedItems);
}

export async function resolveFumbleRisk(conversationId: string) {
  const auth = await getAuth();
  if (!auth?.user || !can(auth.user, 'canUseFumbleQueue')) return { items: [], alertCount: 0, overdueCount: 0 };
  const { state, items } = await queueForUser(auth.user.id);
  const updatedItems = items.filter((item) => item.conversationId !== conversationId);
  state[auth.user.id] = updatedItems;
  await writeQueueState(state);
  await setBadge(updatedItems);
  await scheduleAlarm(updatedItems);
  return summarize(updatedItems);
}

export async function snoozeFumbleRisk(conversationId: string, minutes = 20) {
  const auth = await getAuth();
  if (!auth?.user || !can(auth.user, 'canUseFumbleQueue')) return { items: [], alertCount: 0, overdueCount: 0 };
  const { state, items } = await queueForUser(auth.user.id);
  const updatedItems = items.map((item) =>
    item.conversationId === conversationId
      ? {
          ...item,
          status: 'snoozed' as const,
          snoozedUntil: addMinutes(new Date().toISOString(), minutes),
        }
      : item,
  );
  state[auth.user.id] = updatedItems;
  await writeQueueState(state);
  await setBadge(updatedItems);
  await scheduleAlarm(updatedItems);
  return summarize(updatedItems);
}

export async function runFumbleQueueAlarm() {
  const auth = await getAuth();
  if (!auth?.user || !can(auth.user, 'canUseFumbleQueue')) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const { state, items } = await queueForUser(auth.user.id);
  const now = Date.now();
  const updatedItems = await Promise.all(
    items.map(async (item) => {
      const nextRisk: FumbleQueueItem['riskLevel'] =
        item.status !== 'resolved' && new Date(item.dueAt).getTime() <= now ? 'critical' : item.riskLevel;
      const nextItem = nextRisk === item.riskLevel ? item : { ...item, riskLevel: nextRisk, reason: 'This lead is now past the 30-minute response window.' };
      return maybeNotify(auth.user, nextItem, item);
    }),
  );

  state[auth.user.id] = updatedItems;
  await writeQueueState(state);
  await setBadge(updatedItems);
  await scheduleAlarm(updatedItems);
}
