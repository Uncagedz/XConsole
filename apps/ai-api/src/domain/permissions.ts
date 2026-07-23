import { Role, type User } from '@prisma/client';
import { USER_PERMISSIONS, type Role as PublicRole, type UserPermission } from '@drivecentric-ai/shared';

const allPermissions = [...USER_PERMISSIONS];

const roleDefaultPermissions: Record<PublicRole, UserPermission[]> = {
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
    'canUseAppointmentPush',
    'canUseTradePush',
    'canUseFinancePush',
    'canUseReengageGhosted',
    'canUseConfirmAppointment',
    'canUseMissedAppointment',
  ],
};

export const roleDefaultLimits: Record<
  PublicRole,
  Pick<User, 'dailyRequestLimit' | 'monthlyRequestLimit' | 'dailyTokenLimit'>
> = {
  owner: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
  manager: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
  bdc: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
  salesperson: { dailyRequestLimit: null, monthlyRequestLimit: null, dailyTokenLimit: null },
};

export const channelPermissions: Record<string, UserPermission> = {
  sms: 'canGenerateSms',
  email: 'canGenerateEmail',
  crm_note: 'canGenerateCrmNote',
};

export const tonePermissions: Record<string, UserPermission> = {
  standard_closer: 'canUseStandardTone',
  soft_consultative: 'canUseSoftTone',
  aggressive_appointment_setter: 'canUseAggressiveTone',
  manager_takeover: 'canUseManagerTone',
};

export const actionPermissions: Partial<Record<string, UserPermission>> = {
  appointment_push: 'canUseAppointmentPush',
  trade_in_push: 'canUseTradePush',
  finance_push: 'canUseFinancePush',
  reengage_ghosted: 'canUseReengageGhosted',
  confirm_appointment: 'canUseConfirmAppointment',
  missed_appointment_follow_up: 'canUseMissedAppointment',
  sold_follow_up: 'canUseSoldFollowUp',
};

export function defaultPermissionsForRole(role: PublicRole) {
  return roleDefaultPermissions[role];
}

export function effectivePermissions(user: Pick<User, 'role' | 'permissions'>): UserPermission[] {
  const publicRole: PublicRole =
    user.role === Role.OWNER ? 'owner' : user.role === Role.MANAGER ? 'manager' : user.role === Role.BDC ? 'bdc' : 'salesperson';
  if (publicRole === 'owner') return allPermissions;
  return user.permissions.length ? (user.permissions as UserPermission[]) : roleDefaultPermissions[publicRole];
}

export function hasPermission(user: Pick<User, 'role' | 'permissions'>, permission: UserPermission) {
  return user.role === Role.OWNER || effectivePermissions(user).includes(permission);
}
