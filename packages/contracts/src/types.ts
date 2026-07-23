import type { z } from 'zod';
import type {
  aiGenerateRequestSchema,
  aiGenerateResponseSchema,
  aiFeedbackOutcomeSchema,
  aiFeedbackRequestSchema,
  authResponseSchema,
  billingQuoteResponseSchema,
  billingRechargeRequestSchema,
  billingSetBalanceRequestSchema,
  billingTransferRequestSchema,
  communicationComplianceSchema,
  communicationComplianceStatusSchema,
  dealershipLocationSchema,
  leadTimelineActorSchema,
  leadTimelineChannelSchema,
  leadTimelineDirectionSchema,
  leadTimelineEntrySchema,
  leadContextSchema,
  locationIntelSchema,
  publicUserSchema,
  responseRoleModeSchema,
  inventorySearchResponseSchema,
  inventoryVehicleSchema,
  quotaStatusSchema,
  usageSummarySchema,
  userBioSchema,
} from './schemas.js';

export type Role = 'owner' | 'manager' | 'bdc' | 'salesperson';
export type UserStatus = 'active' | 'sleeping' | 'disabled' | 'password_reset_required';
export type Channel = 'sms' | 'email' | 'crm_note';
export type LeadTimelineActor = z.infer<typeof leadTimelineActorSchema>;
export type LeadTimelineChannel = z.infer<typeof leadTimelineChannelSchema>;
export type LeadTimelineDirection = z.infer<typeof leadTimelineDirectionSchema>;
export type Tone =
  | 'standard_closer'
  | 'soft_consultative'
  | 'aggressive_appointment_setter'
  | 'manager_takeover';
export type QuickAction =
  | 'generate_reply'
  | 'rewrite_shorter'
  | 'rewrite_stronger'
  | 'humanize'
  | 'appointment_push'
  | 'trade_in_push'
  | 'finance_push'
  | 'reengage_ghosted'
  | 'confirm_appointment'
  | 'missed_appointment_follow_up'
  | 'sold_follow_up';

export type LeadTemperature = 'hot' | 'warm' | 'cold';
export type ResponseRoleMode = z.infer<typeof responseRoleModeSchema>;
export type CommunicationComplianceStatus = z.infer<typeof communicationComplianceStatusSchema>;
export type CommunicationCompliance = z.infer<typeof communicationComplianceSchema>;
export type UserPermission =
  | 'canUseAi'
  | 'canReadAnyPage'
  | 'canUseLiveWatch'
  | 'canUseFumbleQueue'
  | 'canReceiveFumbleAlerts'
  | 'canUseReadAllDraft'
  | 'canUseAskBar'
  | 'canUseInventoryLookup'
  | 'canUsePhoneTranscriptContext'
  | 'canViewPersonalizationCues'
  | 'canGenerateSms'
  | 'canGenerateEmail'
  | 'canGenerateCrmNote'
  | 'canUseDealStrategy'
  | 'canInsertIntoCrm'
  | 'canCopyDrafts'
  | 'canUseStandardTone'
  | 'canUseSoftTone'
  | 'canUseAggressiveTone'
  | 'canUseManagerTone'
  | 'canUseAppointmentPush'
  | 'canUseTradePush'
  | 'canUseFinancePush'
  | 'canUseReengageGhosted'
  | 'canUseConfirmAppointment'
  | 'canUseMissedAppointment'
  | 'canUseSoldFollowUp'
  | 'canViewUsage'
  | 'canViewLogs'
  | 'canManageUsers'
  | 'canManagePermissionGroups'
  | 'canSleepUsers'
  | 'canManageWorkflows'
  | 'canManagePrompts'
  | 'canManageSettings'
  | 'canUseAdminDashboard';

export type LeadContext = z.infer<typeof leadContextSchema>;
export type DealershipLocation = z.infer<typeof dealershipLocationSchema>;
export type CustomerLocationIntel = z.infer<typeof locationIntelSchema>;
export type LeadTimelineEntry = z.infer<typeof leadTimelineEntrySchema>;
export type AiGenerateRequest = z.infer<typeof aiGenerateRequestSchema>;
export type AiGenerateResponse = z.infer<typeof aiGenerateResponseSchema>;
export type AiFeedbackOutcome = z.infer<typeof aiFeedbackOutcomeSchema>;
export type AiFeedbackRequest = z.infer<typeof aiFeedbackRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type UserBio = z.infer<typeof userBioSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type QuotaStatus = z.infer<typeof quotaStatusSchema>;
export type BillingQuoteResponse = z.infer<typeof billingQuoteResponseSchema>;
export type BillingRechargeRequest = z.infer<typeof billingRechargeRequestSchema>;
export type BillingSetBalanceRequest = z.infer<typeof billingSetBalanceRequestSchema>;
export type BillingTransferRequest = z.infer<typeof billingTransferRequestSchema>;
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type InventoryVehicle = z.infer<typeof inventoryVehicleSchema>;
export type InventorySearchResponse = z.infer<typeof inventorySearchResponseSchema>;

export interface WorkflowConfig {
  version: string;
  leadStages: string[];
  followUpTiming: Array<{
    stage: string;
    afterMinutes: number;
    action: string;
  }>;
  objectionPlaybooks: Record<string, string[]>;
  escalationRules: Array<{
    name: string;
    when: string;
    action: string;
  }>;
  compliancePhrases: string[];
  prohibitedPhrases: string[];
  managerEscalationTriggers: string[];
  crmAutomationNotes?: string[];
}
