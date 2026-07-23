export const APP_NAME = 'DriveCentric AI Sales Assistant';

export const QUICK_ACTIONS = [
  'generate_reply',
  'rewrite_shorter',
  'rewrite_stronger',
  'humanize',
  'appointment_push',
  'trade_in_push',
  'finance_push',
  'reengage_ghosted',
  'confirm_appointment',
  'missed_appointment_follow_up',
  'sold_follow_up',
] as const;

export const CHANNELS = ['sms', 'email', 'crm_note'] as const;

export const TONES = [
  'standard_closer',
  'soft_consultative',
  'aggressive_appointment_setter',
  'manager_takeover',
] as const;

export const ROLES = ['owner', 'manager', 'bdc', 'salesperson'] as const;
export const PROFILE_ACCESS_ROLES = ['salesperson', 'bdc', 'manager'] as const;
export const PROFILE_ACCESS_ROLE_LABELS: Record<(typeof PROFILE_ACCESS_ROLES)[number], string> = {
  salesperson: 'Sales',
  bdc: 'BDC',
  manager: 'Manager',
};

export function defaultAccessibleProfileRolesForRole(role: (typeof ROLES)[number]) {
  if (role === 'owner') return [...PROFILE_ACCESS_ROLES];
  if (role === 'manager' || role === 'bdc' || role === 'salesperson') return [role];
  return ['salesperson'] as Array<(typeof PROFILE_ACCESS_ROLES)[number]>;
}

export function normalizeAccessibleProfileRoles(
  role: (typeof ROLES)[number],
  accessibleProfileRoles: readonly string[] | null | undefined,
) {
  const allowed = new Set<string>(PROFILE_ACCESS_ROLES);
  const normalized = Array.from(
    new Set((accessibleProfileRoles ?? []).filter((entry): entry is (typeof PROFILE_ACCESS_ROLES)[number] => allowed.has(entry))),
  );
  const withPrimary =
    role === 'owner'
      ? PROFILE_ACCESS_ROLES.filter((entry) => normalized.includes(entry))
      : normalized.includes(role as (typeof PROFILE_ACCESS_ROLES)[number])
        ? normalized
        : [...normalized, role as (typeof PROFILE_ACCESS_ROLES)[number]];
  return (withPrimary.length ? withPrimary : defaultAccessibleProfileRolesForRole(role)).slice(
    0,
    PROFILE_ACCESS_ROLES.length,
  );
}

export const USER_STATUSES = ['active', 'sleeping', 'disabled', 'password_reset_required'] as const;

export const USER_PERMISSIONS = [
  'canUseAi',
  'canReadAnyPage',
  'canUseLiveWatch',
  'canUseFumbleQueue',
  'canReceiveFumbleAlerts',
  'canUseReadAllDraft',
  'canUseAskBar',
  'canUseInventoryLookup',
  'canUsePhoneTranscriptContext',
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
  'canManageUsers',
  'canManagePermissionGroups',
  'canSleepUsers',
  'canManageWorkflows',
  'canManagePrompts',
  'canManageSettings',
  'canUseAdminDashboard',
] as const;

export const USER_PERMISSION_LABELS: Record<(typeof USER_PERMISSIONS)[number], string> = {
  canUseAi: 'Use AI assistant',
  canReadAnyPage: 'Read active webpage',
  canUseLiveWatch: 'Use live watch',
  canUseFumbleQueue: 'Use fumble risk queue',
  canReceiveFumbleAlerts: 'Receive fumble alerts',
  canUseReadAllDraft: 'Read all and draft',
  canUseAskBar: 'Use ask bar',
  canUseInventoryLookup: 'Use inventory lookup',
  canUsePhoneTranscriptContext: 'Use call notes/transcript context',
  canViewPersonalizationCues: 'View personalization cues',
  canGenerateSms: 'Generate SMS',
  canGenerateEmail: 'Generate email',
  canGenerateCrmNote: 'Generate CRM notes',
  canUseDealStrategy: 'Generate deal strategy',
  canInsertIntoCrm: 'Insert into CRM',
  canCopyDrafts: 'Copy drafts',
  canUseStandardTone: 'Standard closer tone',
  canUseSoftTone: 'Soft consultative tone',
  canUseAggressiveTone: 'Aggressive appointment setter tone',
  canUseManagerTone: 'Manager takeover tone',
  canUseAppointmentPush: 'Appointment push',
  canUseTradePush: 'Trade-in push',
  canUseFinancePush: 'Finance push',
  canUseReengageGhosted: 'Re-engage ghosted leads',
  canUseConfirmAppointment: 'Confirm appointment',
  canUseMissedAppointment: 'Missed appointment follow-up',
  canUseSoldFollowUp: 'Sold follow-up',
  canViewUsage: 'View usage analytics',
  canViewLogs: 'View logs and QA',
  canManageUsers: 'Manage users',
  canManagePermissionGroups: 'Manage permission groups',
  canSleepUsers: 'Sleep or wake users',
  canManageWorkflows: 'Manage workflows',
  canManagePrompts: 'Manage prompts',
  canManageSettings: 'Manage dealership settings',
  canUseAdminDashboard: 'Access admin dashboard',
};
