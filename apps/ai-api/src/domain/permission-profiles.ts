import { USER_PERMISSIONS, type Role as PublicRole, type UserPermission } from '@drivecentric-ai/shared';
import { defaultPermissionsForRole, roleDefaultLimits } from './permissions.js';

export interface PermissionProfile {
  permissions: UserPermission[];
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  dailyTokenLimit: number | null;
}

function sanitizePermissions(input: unknown, fallback: UserPermission[]) {
  if (!Array.isArray(input)) return fallback;
  const allowed = new Set([...USER_PERMISSIONS]);
  const values = input.filter((value): value is UserPermission => typeof value === 'string' && allowed.has(value as UserPermission));
  return values.length ? values : fallback;
}

function sanitizeLimit(value: unknown, fallback: number | null) {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function permissionProfileForRole(role: Exclude<PublicRole, 'owner'>, settings: unknown): PermissionProfile {
  const defaults = {
    permissions: defaultPermissionsForRole(role),
    dailyRequestLimit: roleDefaultLimits[role].dailyRequestLimit,
    monthlyRequestLimit: roleDefaultLimits[role].monthlyRequestLimit,
    dailyTokenLimit: roleDefaultLimits[role].dailyTokenLimit,
  };

  const record =
    settings && typeof settings === 'object'
      ? (settings as {
          permissionProfiles?: Partial<Record<Exclude<PublicRole, 'owner'>, Partial<PermissionProfile>>>;
        })
      : {};
  const profile = record.permissionProfiles?.[role];
  if (!profile) return defaults;

  return {
    permissions: sanitizePermissions(profile.permissions, defaults.permissions),
    dailyRequestLimit: null,
    monthlyRequestLimit: null,
    dailyTokenLimit: null,
  };
}
