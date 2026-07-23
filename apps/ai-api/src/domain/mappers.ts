import { MessageChannel, MessageTone, Role, UserStatus, type Dealership, type User } from '@prisma/client';
import {
  dealershipLocationFromSettings,
  normalizeAccessibleProfileRoles,
  type PublicUser,
  type Role as PublicRole,
  type Tone,
  type UserStatus as PublicUserStatus,
} from '@drivecentric-ai/shared';
import { effectivePermissions } from './permissions.js';
import { creditBalanceView } from '../services/billing.service.js';

export function toPublicRole(role: Role): PublicRole {
  if (role === Role.OWNER) return 'owner';
  if (role === Role.MANAGER) return 'manager';
  if (role === Role.BDC) return 'bdc';
  return 'salesperson';
}

export function toPrismaRole(role: PublicRole): Role {
  if (role === 'owner') return Role.OWNER;
  if (role === 'manager') return Role.MANAGER;
  if (role === 'bdc') return Role.BDC;
  return Role.SALESPERSON;
}

export function toPublicUserStatus(status: UserStatus): PublicUserStatus {
  if (status === UserStatus.SLEEPING) return 'sleeping';
  if (status === UserStatus.DISABLED) return 'disabled';
  if (status === UserStatus.PASSWORD_RESET_REQUIRED) return 'password_reset_required';
  return 'active';
}

export function toPrismaUserStatus(status: PublicUserStatus): UserStatus {
  if (status === 'sleeping') return UserStatus.SLEEPING;
  if (status === 'disabled') return UserStatus.DISABLED;
  if (status === 'password_reset_required') return UserStatus.PASSWORD_RESET_REQUIRED;
  return UserStatus.ACTIVE;
}

export function toPrismaChannel(channel: string): MessageChannel {
  if (channel === 'email') return MessageChannel.EMAIL;
  if (channel === 'crm_note') return MessageChannel.CRM_NOTE;
  return MessageChannel.SMS;
}

export function toPrismaTone(tone: Tone): MessageTone {
  if (tone === 'soft_consultative') return MessageTone.SOFT_CONSULTATIVE;
  if (tone === 'aggressive_appointment_setter') return MessageTone.AGGRESSIVE_APPOINTMENT_SETTER;
  if (tone === 'manager_takeover') return MessageTone.MANAGER_TAKEOVER;
  return MessageTone.STANDARD_CLOSER;
}

export function toPublicUser(user: User & { dealership?: Pick<Dealership, 'name' | 'settings'> }): PublicUser {
  return {
    id: user.id,
    userId: user.userId,
    email: user.email,
    name: user.name,
    signatureName: user.signatureName ?? user.name,
    signatureDealershipName: user.signatureDealershipName ?? user.dealership?.name,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    displayName: user.displayName ?? user.signatureName ?? user.name,
    dateOfBirth: user.dateOfBirth?.toISOString(),
    hometown: user.hometown ?? undefined,
    movedHereReason: user.movedHereReason ?? undefined,
    yearsSellingCars: user.yearsSellingCars ?? null,
    previousCareer: user.previousCareer ?? undefined,
    militaryService: user.militaryService ?? undefined,
    favoriteLocalSpot: user.favoriteLocalSpot ?? undefined,
    personalWhy: user.personalWhy ?? undefined,
    customerBio: user.customerBio ?? undefined,
    bioCompletedAt: user.bioCompletedAt?.toISOString() ?? null,
    profileComplete: Boolean(user.bioCompletedAt),
    role: toPublicRole(user.role),
    accessibleProfileRoles: normalizeAccessibleProfileRoles(
      toPublicRole(user.role),
      'accessibleProfileRoles' in user ? user.accessibleProfileRoles : undefined,
    ),
    status: toPublicUserStatus(user.status),
    aiEnabled: user.aiEnabled,
    permissions: effectivePermissions(user),
    dailyRequestLimit: user.dailyRequestLimit,
    bonusDailyRequestLimit: user.bonusDailyRequestLimit,
    monthlyRequestLimit: user.monthlyRequestLimit,
    dailyTokenLimit: user.dailyTokenLimit,
    ...creditBalanceView(user),
    dealershipId: user.dealershipId,
    dealershipName: user.dealership?.name,
    dealershipLocation: dealershipLocationFromSettings(user.dealership?.settings),
  };
}
