import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import argon2 from 'argon2';
import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import {
  aiFeedbackRequestSchema,
  aiGenerateRequestSchema,
  createUserRequestSchema,
  defaultAccessibleProfileRolesForRole,
  loginRequestSchema,
  normalizeAccessibleProfileRoles,
  refreshRequestSchema,
  updateUserRequestSchema,
  USER_PERMISSIONS,
  workflowRuleSchema,
  type AiGenerateRequest,
  type AiGenerateResponse,
  type LeadTemperature,
  type PublicUser,
  type Role,
  type UserPermission,
} from '@drivecentric-ai/shared';
import { defaultPromptConfig, defaultWorkflowConfig } from '@drivecentric-ai/config';
import { InventoryService } from './services/inventory.service.js';
import { ResponseEvaluatorService } from './services/response-evaluator.service.js';
import {
  buildOpenAILeadResponsePrompt,
  chooseLeadResponseStrategy,
  classifyLeadIntent,
  classifyLocation,
  fallbackLlmResult,
  getLatestCustomerMessage,
  SAFE_OPENAI_FALLBACK_TEXT,
  type DealershipResponseSettings,
  type LeadIntent,
  type LocationCategory,
} from './services/lead-response-engine.service.js';
import type { Dealership, User } from '@prisma/client';

interface LocalUser extends PublicUser {
  passwordHash: string;
  permissions: UserPermission[];
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  dailyTokenLimit: number | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LocalSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  revokedAt?: string | null;
}

interface LocalUsageLog {
  id: string;
  dealershipId: string;
  userId: string;
  conversationId: string;
  day: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

interface LocalMessageLog {
  id: string;
  dealershipId: string;
  userId: string;
  conversationId: string;
  channel: string;
  tone: string;
  action: string;
  leadContext: unknown;
  prompt: string;
  output: unknown;
  evaluator: unknown;
  flagged: boolean;
  flags: string[];
  createdAt: string;
  user?: { name: string; userId: string };
}

interface LocalAuditLog {
  id: string;
  dealershipId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor?: { name: string; userId: string };
}

interface LocalDealership {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  aiEnabled: boolean;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  settings: unknown;
  extensionMinVersion: string;
  extensionLatestVersion: string;
  supportEmail: string | null;
}

interface LocalDb {
  dealership: LocalDealership;
  users: LocalUser[];
  sessions: LocalSession[];
  workflowRules: Array<{
    id: string;
    key: string;
    title: string;
    config: unknown;
    isActive: boolean;
    updatedAt: string;
  }>;
  promptTemplates: Array<{
    id: string;
    key: string;
    name: string;
    content: string;
    isActive: boolean;
    updatedAt: string;
  }>;
  usageLogs: LocalUsageLog[];
  messageLogs: LocalMessageLog[];
  auditLogs: LocalAuditLog[];
  globalAiKillSwitch: boolean;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const dataPath = path.resolve(__dirname, '../local-data.json');
const evaluator = new ResponseEvaluatorService();
const inventory = new InventoryService();
const currentExtensionVersion = (process.env.EXTENSION_LATEST_VERSION ?? '0.1.58').trim();
const allPermissions = [...USER_PERMISSIONS];
const localOpenAiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

const roleDefaultLimits: Record<Role, Pick<LocalUser, 'dailyRequestLimit' | 'monthlyRequestLimit' | 'dailyTokenLimit'>> = {
  owner: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
  manager: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
  bdc: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
  salesperson: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
};

const roleDefaultPermissions: Record<Role, UserPermission[]> = {
  owner: allPermissions,
  manager: [
    'canUseAi',
    'canReadAnyPage',
    'canUseLiveWatch',
    'canUseFumbleQueue',
    'canReceiveFumbleAlerts',
    'canUseReadAllDraft',
    'canUseAskBar',
    'canUseInventoryLookup',
    'canViewPersonalizationCues',
    'canGenerateSms',
    'canGenerateEmail',
    'canGenerateCrmNote',
    'canUseDealStrategy',
    'canInsertIntoCrm',
    'canCopyDrafts',
    'canUseStandardTone',
    'canUseSoftTone',
    'canUseAggressiveTone',
    'canUseManagerTone',
    'canUseAppointmentPush',
    'canUseTradePush',
    'canUseFinancePush',
    'canUseReengageGhosted',
    'canUseConfirmAppointment',
    'canUseMissedAppointment',
    'canUseSoldFollowUp',
    'canViewUsage',
    'canViewLogs',
    'canManageWorkflows',
    'canManagePrompts',
    'canUseAdminDashboard',
  ],
  bdc: [
    'canUseAi',
    'canReadAnyPage',
    'canUseLiveWatch',
    'canUseFumbleQueue',
    'canReceiveFumbleAlerts',
    'canUseReadAllDraft',
    'canUseAskBar',
    'canUseInventoryLookup',
    'canViewPersonalizationCues',
    'canGenerateSms',
    'canGenerateEmail',
    'canGenerateCrmNote',
    'canUseDealStrategy',
    'canInsertIntoCrm',
    'canCopyDrafts',
    'canUseStandardTone',
    'canUseSoftTone',
    'canUseAppointmentPush',
    'canUseReengageGhosted',
    'canUseConfirmAppointment',
    'canUseMissedAppointment',
  ],
  salesperson: [
    'canUseAi',
    'canReadAnyPage',
    'canUseLiveWatch',
    'canUseFumbleQueue',
    'canReceiveFumbleAlerts',
    'canUseReadAllDraft',
    'canUseAskBar',
    'canUseInventoryLookup',
    'canViewPersonalizationCues',
    'canGenerateSms',
    'canGenerateEmail',
    'canUseDealStrategy',
    'canInsertIntoCrm',
    'canCopyDrafts',
    'canUseStandardTone',
    'canUseSoftTone',
    'canUseAppointmentPush',
    'canUseTradePush',
    'canUseFinancePush',
    'canUseReengageGhosted',
    'canUseConfirmAppointment',
    'canUseMissedAppointment',
  ],
};

const channelPermissions: Record<string, UserPermission> = {
  sms: 'canGenerateSms',
  email: 'canGenerateEmail',
  crm_note: 'canGenerateCrmNote',
};

const tonePermissions: Record<string, UserPermission> = {
  standard_closer: 'canUseStandardTone',
  soft_consultative: 'canUseSoftTone',
  aggressive_appointment_setter: 'canUseAggressiveTone',
  manager_takeover: 'canUseManagerTone',
};

const actionPermissions: Partial<Record<string, UserPermission>> = {
  appointment_push: 'canUseAppointmentPush',
  trade_in_push: 'canUseTradePush',
  finance_push: 'canUseFinancePush',
  reengage_ghosted: 'canUseReengageGhosted',
  confirm_appointment: 'canUseConfirmAppointment',
  missed_appointment_follow_up: 'canUseMissedAppointment',
  sold_follow_up: 'canUseSoldFollowUp',
};

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function publicUser(user: LocalUser): PublicUser {
  return {
    id: user.id,
    userId: user.userId,
    email: user.email,
    name: user.name,
    signatureName: user.signatureName ?? user.name,
    signatureDealershipName: user.signatureDealershipName ?? user.dealershipName,
    role: user.role,
    accessibleProfileRoles: normalizeAccessibleProfileRoles(user.role, user.accessibleProfileRoles),
    status: user.status,
    aiEnabled: user.aiEnabled,
    permissions: user.role === 'owner' ? allPermissions : user.permissions,
    dailyRequestLimit: user.dailyRequestLimit,
    monthlyRequestLimit: user.monthlyRequestLimit,
    dailyTokenLimit: user.dailyTokenLimit,
    creditBalanceMicros: user.creditBalanceMicros ?? null,
    creditBalanceUsd: user.creditBalanceUsd ?? null,
    estimatedCreditRequestsRemaining: user.estimatedCreditRequestsRemaining ?? null,
    estimatedCreditTokensRemaining: user.estimatedCreditTokensRemaining ?? null,
    dealershipId: user.dealershipId,
    dealershipName: user.dealershipName,
  };
}

type LocalUserShape = Partial<LocalUser> &
  Pick<LocalUser, 'id' | 'userId' | 'email' | 'name' | 'passwordHash' | 'role' | 'status' | 'aiEnabled' | 'dealershipId'>;

function normalizeUser(user: LocalUserShape, dealershipName: string): LocalUser {
  const limits = roleDefaultLimits[user.role];
  return {
    ...user,
    permissions: user.role === 'owner' ? allPermissions : (user.permissions ?? roleDefaultPermissions[user.role]),
    accessibleProfileRoles: normalizeAccessibleProfileRoles(user.role, user.accessibleProfileRoles),
    dailyRequestLimit: user.dailyRequestLimit === undefined ? limits.dailyRequestLimit : user.dailyRequestLimit,
    monthlyRequestLimit: user.monthlyRequestLimit === undefined ? limits.monthlyRequestLimit : user.monthlyRequestLimit,
    dailyTokenLimit: user.dailyTokenLimit === undefined ? limits.dailyTokenLimit : user.dailyTokenLimit,
    dealershipName: user.dealershipName ?? dealershipName,
    signatureName: user.signatureName ?? user.name,
    signatureDealershipName: user.signatureDealershipName ?? user.dealershipName ?? dealershipName,
    createdAt: user.createdAt ?? now(),
    updatedAt: user.updatedAt ?? now(),
  };
}

function hasPermission(user: LocalUser, permission: UserPermission) {
  return user.role === 'owner' || user.permissions.includes(permission);
}

function canAuthenticate(user: LocalUser | undefined): user is LocalUser {
  return Boolean(user && (user.status === 'active' || user.status === 'password_reset_required'));
}

function assertPermission(user: LocalUser, permission: UserPermission, message?: string) {
  if (!hasPermission(user, permission)) {
    throw new HttpError(403, message ?? `Permission required: ${permission}`);
  }
}

function startOfMonthIso() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function assertUsageLimits(db: LocalDb, user: LocalUser) {
  void db;
  void user;
}

function ensureClaireWorkflowNote(config: unknown) {
  if (!config || typeof config !== 'object') return false;
  const record = config as { crmAutomationNotes?: string[] };
  const note = 'Claire is DriveCentric AI bot automation. Treat Claire messages as CRM context, not customer intent.';
  if (!Array.isArray(record.crmAutomationNotes)) {
    record.crmAutomationNotes = [note];
    return true;
  }
  if (!record.crmAutomationNotes.some((item) => /claire/i.test(item))) {
    record.crmAutomationNotes.push(note);
    return true;
  }
  return false;
}

function ensurePermissionProfiles(settings: unknown) {
  const base = settings && typeof settings === 'object' ? { ...(settings as Record<string, unknown>) } : {};
  const current =
    base.permissionProfiles && typeof base.permissionProfiles === 'object'
      ? (base.permissionProfiles as Record<string, unknown>)
      : {};

  const next = {
    manager: {
      permissions: roleDefaultPermissions.manager,
      dailyRequestLimit: roleDefaultLimits.manager.dailyRequestLimit,
      monthlyRequestLimit: roleDefaultLimits.manager.monthlyRequestLimit,
      dailyTokenLimit: roleDefaultLimits.manager.dailyTokenLimit,
      ...(current.manager && typeof current.manager === 'object' ? (current.manager as Record<string, unknown>) : {}),
    },
    salesperson: {
      permissions: roleDefaultPermissions.salesperson,
      dailyRequestLimit: roleDefaultLimits.salesperson.dailyRequestLimit,
      monthlyRequestLimit: roleDefaultLimits.salesperson.monthlyRequestLimit,
      dailyTokenLimit: roleDefaultLimits.salesperson.dailyTokenLimit,
      ...(current.salesperson && typeof current.salesperson === 'object' ? (current.salesperson as Record<string, unknown>) : {}),
    },
  };

  const changed = JSON.stringify(current) !== JSON.stringify(next);
  return {
    changed,
    settings: {
      ...base,
      permissionProfiles: next,
    },
  };
}

function permissionProfileForRole(role: Exclude<Role, 'owner'>, settings: unknown) {
  const defaults = {
    permissions: roleDefaultPermissions[role],
    dailyRequestLimit: roleDefaultLimits[role].dailyRequestLimit,
    monthlyRequestLimit: roleDefaultLimits[role].monthlyRequestLimit,
    dailyTokenLimit: roleDefaultLimits[role].dailyTokenLimit,
  };

  const record =
    settings && typeof settings === 'object'
      ? (settings as {
          permissionProfiles?: Partial<
            Record<
              Exclude<Role, 'owner'>,
              {
                permissions?: UserPermission[];
                dailyRequestLimit?: number | null;
                monthlyRequestLimit?: number | null;
                dailyTokenLimit?: number | null;
              }
            >
          >;
        })
      : {};
  const profile = record.permissionProfiles?.[role];
  if (!profile) return defaults;

  const allowed = new Set(allPermissions);
  const permissions =
    Array.isArray(profile.permissions) && profile.permissions.length
      ? profile.permissions.filter((permission): permission is UserPermission => allowed.has(permission))
      : defaults.permissions;

  return {
    permissions,
    dailyRequestLimit:
      typeof profile.dailyRequestLimit === 'number' || profile.dailyRequestLimit === null
        ? profile.dailyRequestLimit
        : defaults.dailyRequestLimit,
    monthlyRequestLimit:
      typeof profile.monthlyRequestLimit === 'number' || profile.monthlyRequestLimit === null
        ? profile.monthlyRequestLimit
        : defaults.monthlyRequestLimit,
    dailyTokenLimit:
      typeof profile.dailyTokenLimit === 'number' || profile.dailyTokenLimit === null
        ? profile.dailyTokenLimit
        : defaults.dailyTokenLimit,
  };
}

async function loadDb(): Promise<LocalDb> {
  try {
    const db = JSON.parse(await fs.readFile(dataPath, 'utf8')) as LocalDb;
    let changed = false;

    db.users = db.users.map((user) => {
      const normalized = normalizeUser(user, db.dealership.name);
      if (
        user.permissions === undefined ||
        user.accessibleProfileRoles === undefined ||
        user.dailyRequestLimit === undefined ||
        user.monthlyRequestLimit === undefined ||
        user.dailyTokenLimit === undefined
      ) {
        changed = true;
      }
      return normalized;
    });

    if (ensureClaireWorkflowNote(db.dealership.settings)) changed = true;
    const dealershipSettings = ensurePermissionProfiles(db.dealership.settings);
    if (dealershipSettings.changed) {
      db.dealership.settings = dealershipSettings.settings;
      changed = true;
    }
    for (const rule of db.workflowRules) {
      if (ensureClaireWorkflowNote(rule.config)) changed = true;
    }
    if (db.dealership.extensionLatestVersion !== currentExtensionVersion) {
      db.dealership.extensionLatestVersion = currentExtensionVersion;
      changed = true;
    }

    if (changed) await saveDb(db);
    return db;
  } catch {
    const passwordHash = await argon2.hash('ChangeMeNow!123');
    const dealership: LocalDealership = {
      id: 'dealer_local_demo',
      name: 'Local Demo Motors',
      slug: 'local-demo-motors',
      isActive: true,
      aiEnabled: true,
      dailyTokenLimit: 250000,
      monthlyTokenLimit: 5000000,
      settings: ensurePermissionProfiles(defaultWorkflowConfig).settings,
      extensionMinVersion: '0.1.0',
      extensionLatestVersion: currentExtensionVersion,
      supportEmail: 'owner@example.com',
    };
    const owner: LocalUser = {
      id: 'user_owner_local',
      userId: 'owner',
      email: 'owner@example.com',
      name: 'Owner Admin',
      signatureName: 'Owner Admin',
      signatureDealershipName: dealership.name,
      passwordHash,
      role: 'owner',
      status: 'active',
      aiEnabled: true,
      permissions: allPermissions,
      accessibleProfileRoles: defaultAccessibleProfileRolesForRole('owner'),
      dailyRequestLimit: null,
      monthlyRequestLimit: null,
      dailyTokenLimit: null,
      dealershipId: dealership.id,
      dealershipName: dealership.name,
      createdAt: now(),
      updatedAt: now(),
    };
    const db: LocalDb = {
      dealership,
      users: [owner],
      sessions: [],
      workflowRules: [
        {
          id: id('workflow'),
          key: 'default_store_process',
          title: 'Default Store Process',
          config: defaultWorkflowConfig,
          isActive: true,
          updatedAt: now(),
        },
      ],
      promptTemplates: [
        {
          id: id('prompt'),
          key: 'base_sales_prompt',
          name: 'Base Sales Prompt',
          content: JSON.stringify(defaultPromptConfig, null, 2),
          isActive: true,
          updatedAt: now(),
        },
      ],
      usageLogs: [],
      messageLogs: [],
      auditLogs: [
        {
          id: id('audit'),
          dealershipId: dealership.id,
          actorUserId: owner.id,
          action: 'local.seed.completed',
          targetType: 'system',
          metadata: { userId: owner.userId },
          createdAt: now(),
        },
      ],
      globalAiKillSwitch: false,
    };
    await saveDb(db);
    return db;
  }
}

async function saveDb(db: LocalDb) {
  await fs.writeFile(dataPath, JSON.stringify(db, null, 2), 'utf8');
}

async function withDb<T>(fn: (db: LocalDb) => Promise<T> | T) {
  const db = await loadDb();
  const result = await fn(db);
  await saveDb(db);
  return result;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  const db = await loadDb();
  const session = db.sessions.find(
    (item) => item.accessToken === token && !item.revokedAt && new Date(item.expiresAt) > new Date(),
  );
  const user = session ? db.users.find((item) => item.id === session.userId) : undefined;
  if (!session || !canAuthenticate(user) || !db.dealership.isActive) {
    next(new HttpError(401, 'Session expired'));
    return;
  }

  req.auth = {
    userId: user.id,
    appUserId: user.userId,
    role: user.role,
    dealershipId: user.dealershipId,
    sessionId: session.id,
  };
  next();
}

function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new HttpError(403, 'Insufficient permissions'));
      return;
    }
    next();
  };
}

function requirePermission(permission: UserPermission) {
  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw new HttpError(401, 'Authentication required');
    const db = await loadDb();
    const user = db.users.find((item) => item.id === req.auth!.userId);
    if (!user) throw new HttpError(401, 'Session expired');
    assertPermission(user, permission);
    next();
  });
}

function token() {
  return crypto.randomBytes(36).toString('base64url');
}

function sessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt.toISOString();
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function estimateCostUsd(inputTokens: number, outputTokens: number) {
  return Number((inputTokens * 0.0000004 + outputTokens * 0.0000016).toFixed(6));
}

function userSummary(db: LocalDb, userId: string) {
  const user = db.users.find((item) => item.id === userId);
  return user ? { name: user.name, userId: user.userId } : undefined;
}

function flattenOpenAiResponseText(data: unknown) {
  const response = data as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  if (response.output_text) return response.output_text;
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join('\n') ?? ''
  );
}

function outputRecord(output: unknown): Record<string, unknown> {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return { ...(output as Record<string, unknown>) };
  }
  return { value: output };
}

function learningItems(output: unknown): Array<Record<string, unknown>> {
  const record = outputRecord(output);
  return Array.isArray(record.learning)
    ? record.learning.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function parseLocalAiOutput(
  rawText: string,
  fallbackLeadScore: LeadTemperature,
) {
  try {
    const parsed = JSON.parse(rawText) as {
      nextBestAction?: string;
      leadScore?: LeadTemperature;
      detectedLanguage?: string;
      customerTranslation?: string;
      replyTranslation?: string;
      options?: Array<{ label?: string; text?: string; translation?: string }>;
    };
    const options = (Array.isArray(parsed.options) ? parsed.options : [])
      .slice(0, 3)
      .map((option, index) => ({
        label: option.label || (index === 0 ? 'Suggested Response' : `Option ${index + 1}`),
        text: option.text ?? '',
        translation: option.translation,
      }))
      .filter((option) => option.text.trim().length > 0);

    return {
      nextBestAction: parsed.nextBestAction ?? 'Answer the latest message, then ask one natural needs-analysis question.',
      leadScore:
        parsed.leadScore && (['hot', 'warm', 'cold'] as LeadTemperature[]).includes(parsed.leadScore)
          ? parsed.leadScore
          : fallbackLeadScore,
      detectedLanguage: parsed.detectedLanguage,
      customerTranslation: parsed.customerTranslation,
      replyTranslation: parsed.replyTranslation,
      optionTexts: options.map((option) => option.text),
      optionTranslations: options.map((option) => option.translation),
      labels: options.map((option) => option.label),
    };
  } catch {
    return {
      nextBestAction: 'Answer the latest message, then ask one natural needs-analysis question.',
      leadScore: fallbackLeadScore,
      detectedLanguage: undefined,
      customerTranslation: undefined,
      replyTranslation: undefined,
      optionTexts: rawText.trim() ? [rawText.trim()] : [],
      optionTranslations: [],
      labels: rawText.trim() ? ['Suggested Response'] : [],
    };
  }
}

function localRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function localStringSetting(settings: Record<string, unknown>, keys: string[], fallback?: string) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function localBooleanSetting(settings: Record<string, unknown>, keys: string[], fallback: boolean) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

function localNumberSetting(settings: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return fallback;
}

function localEngineSettings(user: LocalUser, db: LocalDb): DealershipResponseSettings {
  const root = localRecord(db.dealership.settings);
  const nested = {
    ...localRecord(root.aiResponseEngine),
    ...localRecord(root.responseEngine),
    ...localRecord(root.leadResponse),
  };
  const merged = { ...root, ...nested };
  const result: DealershipResponseSettings = {
    dealershipName: localStringSetting(merged, ['dealershipName', 'storeName'], user.signatureDealershipName ?? db.dealership.name) ?? db.dealership.name,
    salespersonTone: localStringSetting(merged, ['salespersonTone', 'defaultTone'], 'warm, helpful, concise, and confident') ?? 'warm, helpful, concise, and confident',
    preferredCallToAction: localStringSetting(merged, ['preferredCallToAction', 'preferredCta'], 'Ask one clear next-step question') ?? 'Ask one clear next-step question',
    localCustomerStrategy:
      localStringSetting(
        merged,
        ['localCustomerStrategy'],
        'If the customer is local and appointment-ready, make the visit valuable. If not, build trust and answer the request first.',
      ) ?? 'If the customer is local and appointment-ready, make the visit valuable. If not, build trust and answer the request first.',
    outOfStateCustomerStrategy:
      localStringSetting(
        merged,
        ['outOfStateCustomerStrategy', 'remoteCustomerStrategy'],
        'Do not ask them to come in. Build confidence with accurate remote steps, video, documents, finance path, deposit, pickup, or shipping only when relevant.',
      ) ??
      'Do not ask them to come in. Build confidence with accurate remote steps, video, documents, finance path, deposit, pickup, or shipping only when relevant.',
    pushAppointment: localBooleanSetting(merged, ['pushAppointment', 'allowAppointmentPush'], false),
    pushFinanceApp: localBooleanSetting(merged, ['pushFinanceApp', 'allowFinanceAppPush'], false),
    pushPhoneCall: localBooleanSetting(merged, ['pushPhoneCall', 'allowPhoneCallPush'], true),
    pushRemotePurchase: localBooleanSetting(merged, ['pushRemotePurchase', 'allowRemotePurchasePush'], true),
    maximumResponseLength: Math.max(80, Math.min(1200, localNumberSetting(merged, ['maximumResponseLength', 'maxResponseLength'], 420))),
  };
  const financeApplicationLink = localStringSetting(merged, ['financeApplicationLink', 'creditAppLink', 'financeAppUrl']);
  const appointmentLink = localStringSetting(merged, ['appointmentLink', 'schedulerLink']);
  const phoneNumber = localStringSetting(merged, ['phoneNumber', 'storePhone', 'salesPhone']);
  if (financeApplicationLink) result.financeApplicationLink = financeApplicationLink;
  if (appointmentLink) result.appointmentLink = appointmentLink;
  if (phoneNumber) result.phoneNumber = phoneNumber;
  return result;
}

function localUserForEngine(user: LocalUser, db: LocalDb) {
  return {
    ...user,
    role: user.role.toUpperCase(),
    dealership: {
      ...db.dealership,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as unknown as User & { dealership: Dealership };
}

function localSafeFallback(fallbackLeadScore: LeadTemperature) {
  const parsed = parseLocalAiOutput(fallbackLlmResult().text, fallbackLeadScore);
  return {
    ...parsed,
    optionTexts: parsed.optionTexts.length ? parsed.optionTexts : [SAFE_OPENAI_FALLBACK_TEXT],
    optionTranslations: parsed.optionTranslations.length ? parsed.optionTranslations : [],
    labels: parsed.labels.length ? parsed.labels : ['Suggested Response'],
    provider: 'safe-fallback',
    model: 'safe-fallback',
    inputTokens: 0,
    outputTokens: 0,
    prompt: {
      system: 'Safe fallback used because AI generation failed.',
      user: '',
    },
    rawText: fallbackLlmResult().text,
  };
}

async function generateLocalAi(input: AiGenerateRequest, user: LocalUser, db: LocalDb) {
  const fallbackLeadScore = evaluator.scoreLead(input.leadContext.visibleText, input.leadContext.priorMessages);
  const latestCustomerMessage = getLatestCustomerMessage(input.leadContext);
  const detectedIntent: LeadIntent = classifyLeadIntent(latestCustomerMessage, input.leadContext);
  const locationCategory: LocationCategory = classifyLocation(input.leadContext);
  const settings = localEngineSettings(user, db);
  const chosenStrategy = chooseLeadResponseStrategy(detectedIntent, locationCategory, settings);
  const prompt = buildOpenAILeadResponsePrompt({
    request: input,
    user: localUserForEngine(user, db),
    detectedIntent,
    locationCategory,
    chosenStrategy,
    latestCustomerMessage,
    settings,
  });
  const useFallback = (reason: string) => {
    const fallback = localSafeFallback(fallbackLeadScore);
    console.info('[local.ai.generate] final_response', {
      conversationId: input.conversationId,
      detectedIntent,
      customerLocationCategory: locationCategory,
      chosenStrategy,
      openAiUsed: false,
      finalGeneratedResponse: fallback.optionTexts[0] ?? SAFE_OPENAI_FALLBACK_TEXT,
      fallbackUsed: true,
      reason,
    });
    return fallback;
  };

  if (process.env.LLM_PROVIDER !== 'openai') {
    console.error('[local.ai.generate] openai_not_used', {
      conversationId: input.conversationId,
      detectedIntent,
      customerLocationCategory: locationCategory,
      chosenStrategy,
      openAiCalled: false,
      fallbackUsed: true,
      reason: 'LLM_PROVIDER is not openai',
    });
    return useFallback('LLM_PROVIDER is not openai');
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('[local.ai.generate] openai_not_used', {
      conversationId: input.conversationId,
      detectedIntent,
      customerLocationCategory: locationCategory,
      chosenStrategy,
      openAiCalled: false,
      fallbackUsed: true,
      reason: 'OPENAI_API_KEY is missing',
    });
    return useFallback('OPENAI_API_KEY is missing');
  }

  const latestCustomerIncluded = Boolean(
    input.leadContext.conversationTimeline?.some((entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text?.trim()),
  );
  console.info('[local.ai.generate] received', {
    conversationId: input.conversationId,
    customerNamePresent: Boolean(input.leadContext.customerName),
    latestCustomerIncluded,
    selectedFilters: {
      action: input.action,
      channel: input.channel,
      tone: input.tone,
      roleMode: input.roleMode,
    },
    locationConfidence: input.leadContext.locationIntel?.confidence ?? input.leadContext.parserDebug?.locationConfidence ?? 'unknown',
    detectedIntent,
    customerLocationCategory: locationCategory,
    chosenStrategy,
    openAiCalled: true,
    model: localOpenAiModel,
  });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: localOpenAiModel,
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 900),
      temperature: 0.55,
      input: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[local.ai.generate] openai_error', {
      conversationId: input.conversationId,
      detectedIntent,
      customerLocationCategory: locationCategory,
      chosenStrategy,
      status: response.status,
      latestCustomerIncluded,
      errorFromOpenAi: errorBody.slice(0, 600),
      fallbackUsed: true,
    });
    return useFallback(`OpenAI HTTP ${response.status}`);
  }

  const data = (await response.json()) as { usage?: { input_tokens?: number; output_tokens?: number } };
  const rawText = flattenOpenAiResponseText(data);
  const parsed = parseLocalAiOutput(rawText, fallbackLeadScore);
  if (!parsed.optionTexts.length) {
    console.error('[local.ai.generate] empty_response', {
      conversationId: input.conversationId,
      detectedIntent,
      customerLocationCategory: locationCategory,
      chosenStrategy,
      fallbackUsed: true,
    });
    return useFallback('OpenAI returned no usable option');
  }
  console.info('[local.ai.generate] openai_result', {
    conversationId: input.conversationId,
    detectedIntent,
    customerLocationCategory: locationCategory,
    chosenStrategy,
    model: localOpenAiModel,
    inputTokens: data.usage?.input_tokens ?? estimateTokens(prompt.system + prompt.user),
    outputTokens: data.usage?.output_tokens ?? estimateTokens(rawText),
    fallbackUsed: false,
  });
  console.info('[local.ai.generate] final_response', {
    conversationId: input.conversationId,
    detectedIntent,
    customerLocationCategory: locationCategory,
    chosenStrategy,
    openAiUsed: true,
    finalGeneratedResponse: parsed.optionTexts[0] ?? '',
    fallbackUsed: false,
  });
  return {
    ...parsed,
    provider: 'openai',
    model: localOpenAiModel,
    inputTokens: data.usage?.input_tokens ?? estimateTokens(prompt.system + prompt.user),
    outputTokens: data.usage?.output_tokens ?? estimateTokens(rawText),
    prompt,
    rawText,
  };
}

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin blocked: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'drivecentric-ai-local-api' });
});

app.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const input = loginRequestSchema.parse(req.body);
    const response = await withDb(async (db) => {
      const user = db.users.find((item) => item.userId.toLowerCase() === input.userId.toLowerCase());
      if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
        throw new HttpError(401, 'Invalid user ID or password');
      }
      if (!canAuthenticate(user) || !db.dealership.isActive) {
        throw new HttpError(403, 'User is not active');
      }

      const session: LocalSession = {
        id: id('session'),
        userId: user.id,
        accessToken: token(),
        refreshToken: token(),
        expiresAt: sessionExpiry(),
      };
      user.lastLoginAt = now();
      db.sessions.push(session);
      db.auditLogs.push({
        id: id('audit'),
        dealershipId: user.dealershipId,
        actorUserId: user.id,
        action: 'auth.login',
        targetType: 'user',
        targetId: user.id,
        metadata: {},
        createdAt: now(),
      });
      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: publicUser(user),
      };
    });
    res.json(response);
  }),
);

app.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const input = refreshRequestSchema.parse(req.body);
    const response = await withDb((db) => {
      const session = db.sessions.find(
        (item) => item.refreshToken === input.refreshToken && !item.revokedAt && new Date(item.expiresAt) > new Date(),
      );
      const user = session ? db.users.find((item) => item.id === session.userId) : undefined;
      if (!session || !canAuthenticate(user)) {
        throw new HttpError(401, 'Refresh token expired');
      }
      session.accessToken = token();
      session.refreshToken = token();
      session.expiresAt = sessionExpiry();
      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: publicUser(user),
      };
    });
    res.json(response);
  }),
);

app.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = await loadDb();
    const user = db.users.find((item) => item.id === req.auth!.userId);
    if (!canAuthenticate(user)) throw new HttpError(401, 'Session expired');
    res.json(publicUser(user));
  }),
);

app.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    await withDb((db) => {
      const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
      const session = db.sessions.find((item) => item.refreshToken === refreshToken);
      if (session) session.revokedAt = now();
    });
    res.json({ ok: true });
  }),
);

app.use('/users', requireAuth, requireRole('owner'), requirePermission('canManageUsers'));

app.get(
  '/users',
  asyncHandler(async (req, res) => {
    const db = await loadDb();
    const users = db.users
      .filter((user) => req.auth?.role === 'owner' || (user.role !== 'owner' && user.dealershipId === req.auth?.dealershipId))
      .map(publicUser);
    res.json(users);
  }),
);

app.post(
  '/users',
  asyncHandler(async (req, res) => {
    const input = createUserRequestSchema.parse(req.body);
    const user = await withDb(async (db) => {
      if (input.role === 'owner') {
        throw new HttpError(403, 'The owner account already exists. Create managers or salespeople here.');
      }
      const nextUserId = input.userId.trim();
      const nextEmail = input.email.trim().toLowerCase();
      if (db.users.some((item) => item.userId.toLowerCase() === nextUserId.toLowerCase() || item.email.toLowerCase() === nextEmail)) {
        throw new HttpError(409, 'User ID or email already exists');
      }
      const profile = permissionProfileForRole(input.role, db.dealership.settings);
      const accessibleProfileRoles = normalizeAccessibleProfileRoles(input.role, input.accessibleProfileRoles);
      const created: LocalUser = {
        id: id('user'),
        userId: nextUserId,
        email: nextEmail,
        name: input.name,
        signatureName: input.signatureName ?? input.name,
        signatureDealershipName: input.signatureDealershipName ?? db.dealership.name,
        passwordHash: await argon2.hash(input.password),
        role: input.role,
        status: 'active',
        aiEnabled: input.aiEnabled,
        permissions: input.permissions ?? profile.permissions,
        accessibleProfileRoles,
        dailyRequestLimit:
          input.dailyRequestLimit === undefined ? profile.dailyRequestLimit : input.dailyRequestLimit,
        monthlyRequestLimit:
          input.monthlyRequestLimit === undefined ? profile.monthlyRequestLimit : input.monthlyRequestLimit,
        dailyTokenLimit: input.dailyTokenLimit === undefined ? profile.dailyTokenLimit : input.dailyTokenLimit,
        dealershipId: req.auth!.dealershipId,
        dealershipName: db.dealership.name,
        createdAt: now(),
        updatedAt: now(),
      };
      db.users.push(created);
      db.auditLogs.push({
        id: id('audit'),
        dealershipId: created.dealershipId,
        actorUserId: req.auth!.userId,
        action: 'user.create',
        targetType: 'user',
        targetId: created.id,
        metadata: { userId: created.userId, role: created.role },
        createdAt: now(),
      });
      return publicUser(created);
    });
    res.status(201).json(user);
  }),
);

app.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const db = await loadDb();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    res.json(publicUser(user));
  }),
);

app.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const input = updateUserRequestSchema.parse(req.body);
    const user = await withDb(async (db) => {
      const target = db.users.find((item) => item.id === req.params.id);
      if (!target) throw new HttpError(404, 'User not found');
      const previousRole = target.role;
      if (target.role !== 'owner' && input.role === 'owner') {
        throw new HttpError(403, 'The owner account is unique. Promote users to manager instead.');
      }
      if (input.email !== undefined) target.email = input.email;
      if (input.name !== undefined) target.name = input.name;
      if (input.signatureName !== undefined) target.signatureName = input.signatureName;
      if (input.signatureDealershipName !== undefined) target.signatureDealershipName = input.signatureDealershipName;
      if (input.role !== undefined) target.role = input.role;
      if (input.accessibleProfileRoles !== undefined || input.role !== undefined || target.role === 'owner') {
        target.accessibleProfileRoles = normalizeAccessibleProfileRoles(
          target.role,
          input.accessibleProfileRoles ?? target.accessibleProfileRoles,
        );
      }
      if (input.status !== undefined) target.status = input.status;
      if (input.aiEnabled !== undefined) target.aiEnabled = input.aiEnabled;
      if (input.role !== undefined && input.role !== previousRole && input.permissions === undefined) {
        if (target.role === 'owner') {
          target.permissions = allPermissions;
          target.accessibleProfileRoles = defaultAccessibleProfileRolesForRole('owner');
          target.dailyRequestLimit = null;
          target.monthlyRequestLimit = null;
          target.dailyTokenLimit = null;
        } else {
          const profile = permissionProfileForRole(target.role, db.dealership.settings);
          target.permissions = profile.permissions;
          target.dailyRequestLimit = profile.dailyRequestLimit;
          target.monthlyRequestLimit = profile.monthlyRequestLimit;
          target.dailyTokenLimit = profile.dailyTokenLimit;
        }
      }
      if (input.permissions !== undefined) {
        target.permissions = target.role === 'owner' ? allPermissions : input.permissions;
      }
      if (input.dailyRequestLimit !== undefined) target.dailyRequestLimit = input.dailyRequestLimit;
      if (input.monthlyRequestLimit !== undefined) target.monthlyRequestLimit = input.monthlyRequestLimit;
      if (input.dailyTokenLimit !== undefined) target.dailyTokenLimit = input.dailyTokenLimit;
      if (input.password !== undefined) target.passwordHash = await argon2.hash(input.password);
      if (target.role === 'owner') {
        target.permissions = allPermissions;
        target.accessibleProfileRoles = defaultAccessibleProfileRolesForRole('owner');
        target.dailyRequestLimit = null;
        target.monthlyRequestLimit = null;
        target.dailyTokenLimit = null;
      }
      target.updatedAt = now();
      if (input.status && input.status !== 'active') {
        db.sessions
          .filter((session) => session.userId === target.id && !session.revokedAt)
          .forEach((session) => {
            session.revokedAt = now();
          });
      }
      db.auditLogs.push({
        id: id('audit'),
        dealershipId: target.dealershipId,
        actorUserId: req.auth!.userId,
        action: 'user.update',
        targetType: 'user',
        targetId: target.id,
        metadata: { fields: Object.keys(input) },
        createdAt: now(),
      });
      return publicUser(target);
    });
    res.json(user);
  }),
);

app.post(
  '/ai/generate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = aiGenerateRequestSchema.parse(req.body);
    const response = await withDb(async (db) => {
      const user = db.users.find((item) => item.id === req.auth!.userId);
      if (!canAuthenticate(user) || !user.aiEnabled) throw new HttpError(403, 'AI access disabled for user');
      if (!db.dealership.aiEnabled || db.globalAiKillSwitch) throw new HttpError(403, 'AI access disabled');
      assertPermission(user, 'canUseAi');
      const channelPermission = channelPermissions[input.channel];
      const tonePermission = tonePermissions[input.tone];
      if (channelPermission) assertPermission(user, channelPermission, `This user cannot generate ${input.channel} replies`);
      if (tonePermission) assertPermission(user, tonePermission, `This user cannot use ${input.tone} tone`);
      const actionPermission = actionPermissions[input.action];
      if (actionPermission) assertPermission(user, actionPermission);
      assertUsageLimits(db, user);

      const ai = await generateLocalAi(input, user, db);
      const options = ai.optionTexts.slice(0, 3).map((text, index) => {
        const evaluation = evaluator.evaluate(text);
        return {
          label: ai.labels[index] ?? (index === 0 ? 'Suggested Response' : `Option ${index + 1}`),
          text,
          translation: ai.optionTranslations[index],
          score: evaluation.score,
          flags: evaluation.flags,
        };
      });
      const complianceFlags = Array.from(new Set(options.flatMap((option) => option.flags)));
      const inputTokens = ai.inputTokens;
      const outputTokens = ai.outputTokens;
      const totalTokens = inputTokens + outputTokens;
      const estimatedCostUsd = estimateCostUsd(inputTokens, outputTokens);
      const generated: AiGenerateResponse = {
        conversationId: input.conversationId,
        nextBestAction: ai.nextBestAction,
        leadScore: ai.leadScore,
        detectedLanguage: ai.detectedLanguage,
        customerTranslation: ai.customerTranslation,
        replyTranslation: ai.replyTranslation,
        options,
        usage: { inputTokens, outputTokens, totalTokens, estimatedCostUsd },
        complianceFlags,
      };
      db.usageLogs.push({
        id: id('usage'),
        dealershipId: user.dealershipId,
        userId: user.id,
        conversationId: input.conversationId,
        day: today(),
        provider: ai.provider,
        model: ai.model,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd,
        createdAt: now(),
      });
      db.messageLogs.push({
        id: id('message'),
        dealershipId: user.dealershipId,
        userId: user.id,
        conversationId: input.conversationId,
        channel: input.channel,
        tone: input.tone,
        action: input.action,
        leadContext: input.leadContext,
        prompt: `${ai.prompt.system}\n\n${ai.prompt.user}`,
        output: { raw: ai.rawText, response: generated },
        evaluator: { complianceFlags },
        flagged: complianceFlags.length > 0,
        flags: complianceFlags,
        createdAt: now(),
      });
      return generated;
    });
    res.json(response);
  }),
);

app.post(
  '/ai/feedback',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = aiFeedbackRequestSchema.parse(req.body);
    const response = await withDb(async (db) => {
      const user = db.users.find((item) => item.id === req.auth!.userId);
      if (!canAuthenticate(user) || !user.aiEnabled) throw new HttpError(403, 'AI access disabled for user');
      assertPermission(user, 'canUseAi');

      const log = [...db.messageLogs]
        .reverse()
        .find((item) => item.dealershipId === user.dealershipId && item.conversationId === input.conversationId);

      if (!log) return { ok: true, learned: false };

      const output = outputRecord(log.output);
      output.learning = [
        {
          outcome: input.outcome,
          selectedText: input.selectedText,
          reason: input.reason,
          action: input.action ?? log.action,
          channel: input.channel,
          userId: user.id,
          userName: user.name,
          createdAt: now(),
          leadSummary: input.leadContext
            ? {
                customerName: input.leadContext.customerName,
                vehicleOfInterest: input.leadContext.vehicleOfInterest,
                leadScore: input.leadContext.leadScore,
                paymentBudgetHints: input.leadContext.paymentBudgetHints,
                tradeInfo: input.leadContext.tradeInfo,
              }
            : undefined,
        },
        ...learningItems(output),
      ].slice(0, 20);
      log.output = JSON.parse(JSON.stringify(output));
      db.auditLogs.push({
        id: id('audit'),
        dealershipId: user.dealershipId,
        actorUserId: user.id,
        action: 'ai.feedback',
        targetType: 'message_log',
        targetId: log.id,
        metadata: {
          conversationId: input.conversationId,
          outcome: input.outcome,
          action: input.action ?? log.action,
          channel: input.channel,
        },
        createdAt: now(),
      });
      return { ok: true, learned: true };
    });
    res.json(response);
  }),
);

app.get(
  '/inventory/search',
  requireAuth,
  requirePermission('canUseInventoryLookup'),
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 9), 1), 30);
    res.json(await inventory.search(query, limit));
  }),
);

app.use('/admin', requireAuth, requireRole('owner', 'manager'), requirePermission('canUseAdminDashboard'));

app.get(
  '/admin/summary',
  asyncHandler(async (req, res) => {
    const db = await loadDb();
    const usageToday = db.usageLogs.filter((item) => item.day === today() && item.dealershipId === req.auth!.dealershipId);
    res.json({
      users: db.users.length,
      activeUsers: db.users.filter((user) => user.status === 'active').length,
      flaggedMessages: db.messageLogs.filter((log) => log.flagged).length,
      aiEnabled: db.dealership.aiEnabled,
      usageToday: {
        totalTokens: usageToday.reduce((sum, row) => sum + row.totalTokens, 0),
        estimatedCostUsd: usageToday.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
        requestCount: usageToday.length,
      },
      dealership: { ...db.dealership, extensionLatestVersion: currentExtensionVersion },
    });
  }),
);

app.get(
  '/admin/usage',
  requirePermission('canViewUsage'),
  asyncHandler(async (_req, res) => {
    const db = await loadDb();
    const grouped = new Map<
      string,
      {
        day: string;
        dealershipId: string;
        userId: string;
        userName: string | undefined;
        userUserId: string | undefined;
        totalTokens: number;
        estimatedCostUsd: number;
        requestCount: number;
        conversations: number;
      }
    >();

    for (const row of db.usageLogs) {
      const key = `${row.day}:${row.userId}`;
      const user = db.users.find((item) => item.id === row.userId);
      const entry =
        grouped.get(key) ??
        grouped
          .set(key, {
            day: row.day,
            dealershipId: row.dealershipId,
            userId: row.userId,
            userName: user?.name,
            userUserId: user?.userId,
            totalTokens: 0,
            estimatedCostUsd: 0,
            requestCount: 0,
            conversations: 0,
          })
          .get(key)!;
      entry.totalTokens += row.totalTokens;
      entry.estimatedCostUsd += row.estimatedCostUsd;
      entry.requestCount += 1;
      entry.conversations += row.conversationId ? 1 : 0;
    }

    res.json(Array.from(grouped.values()).sort((a, b) => b.day.localeCompare(a.day) || a.userId.localeCompare(b.userId)));
  }),
);

app.get('/admin/message-logs', requirePermission('canViewLogs'), asyncHandler(async (_req, res) => {
  const db = await loadDb();
  res.json(db.messageLogs.map((log) => ({ ...log, user: userSummary(db, log.userId) })).reverse().slice(0, 100));
}));

app.get('/admin/audit-logs', requirePermission('canViewLogs'), asyncHandler(async (_req, res) => {
  const db = await loadDb();
  res.json(db.auditLogs.map((log) => ({ ...log, actor: log.actorUserId ? userSummary(db, log.actorUserId) : undefined })).reverse().slice(0, 100));
}));

app.get('/admin/workflow-rules', requirePermission('canManageWorkflows'), asyncHandler(async (_req, res) => {
  const db = await loadDb();
  res.json(db.workflowRules);
}));

app.post('/admin/workflow-rules', requirePermission('canManageWorkflows'), asyncHandler(async (req, res) => {
  const input = workflowRuleSchema.parse(req.body);
  const rule = await withDb((db) => {
    const existing = db.workflowRules.find((item) => item.key === input.key);
    if (existing) {
      existing.title = input.title;
      existing.config = input.config;
      existing.isActive = input.isActive;
      existing.updatedAt = now();
      return existing;
    }
    const created = { id: id('workflow'), key: input.key, title: input.title, config: input.config, isActive: input.isActive, updatedAt: now() };
    db.workflowRules.push(created);
    return created;
  });
  res.status(201).json(rule);
}));

app.get('/admin/prompt-templates', requirePermission('canManagePrompts'), asyncHandler(async (_req, res) => {
  const db = await loadDb();
  res.json(db.promptTemplates);
}));

app.post('/admin/prompt-templates', requirePermission('canManagePrompts'), asyncHandler(async (req, res) => {
  const input = req.body as { key: string; name: string; content: string; isActive: boolean };
  const template = await withDb((db) => {
    const existing = db.promptTemplates.find((item) => item.key === input.key);
    if (existing) {
      existing.name = input.name;
      existing.content = input.content;
      existing.isActive = input.isActive;
      existing.updatedAt = now();
      return existing;
    }
    const created = { id: id('prompt'), key: input.key, name: input.name, content: input.content, isActive: input.isActive, updatedAt: now() };
    db.promptTemplates.push(created);
    return created;
  });
  res.status(201).json(template);
}));

app.get('/admin/settings', requirePermission('canManageSettings'), asyncHandler(async (_req, res) => {
  const db = await loadDb();
  res.json({ dealership: db.dealership, globalAiKillSwitch: db.globalAiKillSwitch });
}));

app.patch('/admin/settings', requireRole('owner'), requirePermission('canManageSettings'), asyncHandler(async (req, res) => {
  const updated = await withDb((db) => {
    const input = req.body as Partial<LocalDealership> & { globalAiKillSwitch?: boolean };
    if (input.aiEnabled !== undefined) db.dealership.aiEnabled = input.aiEnabled;
    if (input.dailyTokenLimit !== undefined) db.dealership.dailyTokenLimit = input.dailyTokenLimit;
    if (input.monthlyTokenLimit !== undefined) db.dealership.monthlyTokenLimit = input.monthlyTokenLimit;
    if (input.settings !== undefined) db.dealership.settings = input.settings;
    if (input.extensionMinVersion !== undefined) db.dealership.extensionMinVersion = input.extensionMinVersion;
    if (input.extensionLatestVersion !== undefined) db.dealership.extensionLatestVersion = input.extensionLatestVersion;
    if (input.supportEmail !== undefined) db.dealership.supportEmail = input.supportEmail;
    if (input.globalAiKillSwitch !== undefined) db.globalAiKillSwitch = input.globalAiKillSwitch;
    return db.dealership;
  });
  res.json(updated);
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: 'local_error', message: error.message } });
    return;
  }
  if (error && typeof error === 'object' && 'issues' in error) {
    res.status(400).json({ error: { code: 'bad_request', message: 'Invalid request body', details: error } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'internal_server_error', message: 'Unexpected local server error' } });
});

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
app.listen(port, () => {
  console.log(`Local API listening on port ${port}`);
  console.log('Default owner login: owner / ChangeMeNow!123');
});
