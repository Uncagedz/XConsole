import { z } from 'zod';
import { CHANNELS, PROFILE_ACCESS_ROLES, QUICK_ACTIONS, ROLES, TONES, USER_PERMISSIONS, USER_STATUSES } from './constants.js';

export const roleSchema = z.enum(ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const channelSchema = z.enum(CHANNELS);
export const toneSchema = z.enum(TONES);
export const quickActionSchema = z.enum(QUICK_ACTIONS);
export const userPermissionSchema = z.enum(USER_PERMISSIONS);
export const profileAccessRoleSchema = z.enum(PROFILE_ACCESS_ROLES);

export const leadTemperatureSchema = z.enum(['hot', 'warm', 'cold']);
export const responseRoleModeSchema = z.enum(['salesperson', 'manager']);
export const communicationComplianceStatusSchema = z.enum(['clear', 'sms_opt_out', 'do_not_contact']);
export const leadTimelineActorSchema = z.enum(['customer', 'salesperson', 'manager', 'automation', 'system', 'unknown']);
export const leadTimelineChannelSchema = z.enum(['text', 'email', 'call', 'note', 'video', 'appt', 'unknown']);
export const leadTimelineDirectionSchema = z.enum(['inbound', 'outbound', 'internal', 'unknown']);

export const leadTimelineEntrySchema = z.object({
  actor: leadTimelineActorSchema.default('unknown'),
  direction: leadTimelineDirectionSchema.default('unknown'),
  channel: leadTimelineChannelSchema.default('unknown'),
  speakerName: z.string().trim().max(160).optional(),
  timestampLabel: z.string().trim().max(120).optional(),
  timestampIso: z.string().datetime().optional(),
  text: z.string().trim().max(3000).optional(),
});

export const leadVehicleRoleSchema = z.enum(['vehicle_of_interest', 'trade_in', 'similar_inventory', 'mentioned']);

export const leadVehicleCandidateSchema = z.object({
  role: leadVehicleRoleSchema,
  year: z.number().int().min(1900).max(2100).optional(),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  trim: z.string().trim().max(160).optional(),
  stock: z.string().trim().max(80).optional(),
  vin: z.string().trim().max(80).optional(),
  price: z.string().trim().max(80).optional(),
  mileage: z.string().trim().max(80).optional(),
  source: z.string().trim().max(160).optional(),
  rawText: z.string().trim().max(1000).optional(),
  confidence: z.number().min(0).max(100).default(0),
});

export const parserWarningSchema = z.string().trim().max(240);

export const parserDebugSchema = z.object({
  messagesParsedCount: z.number().int().nonnegative().default(0),
  latestCustomerMessageFound: z.boolean().default(false),
  latestVisibleActivityLabel: z.string().trim().max(240).optional(),
  latestVisibleActivityText: z.string().trim().max(3000).optional(),
  latestCustomerMessageLabel: z.string().trim().max(240).optional(),
  latestCustomerMessageText: z.string().trim().max(3000).optional(),
  timelineCount: z.number().int().nonnegative().optional(),
  labeledDomTimelineCount: z.number().int().nonnegative().optional(),
  bubbleTimelineCount: z.number().int().nonnegative().optional(),
  inboundCustomerCount: z.number().int().nonnegative().optional(),
  outboundDealerCount: z.number().int().nonnegative().optional(),
  internalNoteCount: z.number().int().nonnegative().optional(),
  vehicleOfInterestConfidence: z.number().min(0).max(100).optional(),
  tradeInConfidence: z.number().min(0).max(100).optional(),
  locationConfidence: z.string().trim().max(80).optional(),
  warnings: z.array(parserWarningSchema).max(12).default([]),
  vehicleCandidates: z.array(leadVehicleCandidateSchema).max(16).default([]),
});

export const customerIntelligenceSchema = z.object({
  customerIntent: z.string().trim().max(500).optional(),
  likelyCaresAbout: z.array(z.string().trim().max(160)).max(10).default([]),
  painPoints: z.array(z.string().trim().max(180)).max(10).default([]),
  nonNegotiables: z.array(z.string().trim().max(180)).max(10).default([]),
  buyingSignals: z.array(z.string().trim().max(180)).max(10).default([]),
  objections: z.array(z.string().trim().max(180)).max(10).default([]),
  missingInfo: z.array(z.string().trim().max(180)).max(12).default([]),
  bestNextQuestion: z.string().trim().max(500).optional(),
  bestNextMove: z.string().trim().max(500).optional(),
  suggestedTone: z.string().trim().max(120).optional(),
});

export const qualificationSummarySchema = z.object({
  known: z.array(z.string().trim().max(180)).max(12).default([]),
  missing: z.array(z.string().trim().max(180)).max(12).default([]),
  highestValueQuestion: z.string().trim().max(500).optional(),
  creditAppAppropriate: z.boolean().default(false),
  appointmentAppropriate: z.boolean().default(false),
  reason: z.string().trim().max(600).optional(),
});

export const localResearchSchema = z.object({
  status: z.enum(['not_requested', 'not_connected', 'available']).default('not_requested'),
  source: z.string().trim().max(160).optional(),
  places: z.array(z.string().trim().max(180)).max(6).default([]),
  note: z.string().trim().max(500).optional(),
});

export const communicationComplianceSchema = z.object({
  status: communicationComplianceStatusSchema.default('clear'),
  reason: z.string().trim().max(500).optional(),
  evidence: z.array(z.string().trim().max(500)).max(8).default([]),
  lastOptOutAt: z.string().datetime().optional(),
  lastOptInAt: z.string().datetime().optional(),
});

export const dealershipLocationSchema = z.object({
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(40).optional(),
  zipCode: z.string().trim().regex(/^\d{5}$/).optional(),
});

export const locationIntelSchema = z.object({
  source: z.enum(['zip', 'page_city_state', 'phone_area', 'unknown']),
  confidence: z.enum(['zip_confirmed', 'page_confirmed', 'estimated_from_phone', 'unknown']),
  classification: z.enum(['local', 'local_far', 'out_of_state', 'unknown']),
  route: z.enum(['showroom', 'remote']),
  zipCode: z.string().trim().regex(/^\d{5}$/).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(40).optional(),
  distanceMiles: z.number().nonnegative().optional(),
  driveTimeMinutes: z.number().int().nonnegative().optional(),
  label: z.string().trim().max(80),
  summary: z.string().trim().max(500),
  nextStep: z.string().trim().max(500),
  rapportAnchor: z.string().trim().max(220).optional(),
  evidence: z.array(z.string().trim().max(500)).max(8).default([]),
  askForZip: z.boolean(),
});

export const userBioSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hometown: z.string().trim().min(2).max(160),
  movedHereReason: z.string().trim().min(8).max(500),
  yearsSellingCars: z.number().int().min(0).max(80),
  previousCareer: z.string().trim().min(2).max(220),
  militaryService: z.string().trim().min(2).max(220),
  favoriteLocalSpot: z.string().trim().min(2).max(220),
  personalWhy: z.string().trim().min(12).max(800),
  customerBio: z.string().trim().min(20).max(900),
});

export const leadContextSchema = z.object({
  pageUrl: z.string().url().optional(),
  customerName: z.string().trim().max(160).optional(),
  customerLocation: z.string().trim().max(240).optional(),
  customerZipCode: z.string().trim().regex(/^\d{5}$/).optional(),
  locationIntel: locationIntelSchema.optional(),
  phoneNumbers: z.array(z.string().trim().max(80)).max(12).default([]),
  emails: z.array(z.string().trim().email().max(180)).max(12).default([]),
  personalizationSignals: z.array(z.string().trim().max(320)).max(30).default([]),
  vehicleOfInterest: z.string().trim().max(220).optional(),
  vehicleOfInterestDetails: leadVehicleCandidateSchema.optional(),
  stockNumber: z.string().trim().max(80).optional(),
  tradeVehicle: leadVehicleCandidateSchema.optional(),
  similarInventory: z.array(leadVehicleCandidateSchema).max(12).optional(),
  mentionedVehicles: z.array(leadVehicleCandidateSchema).max(20).optional(),
  tradeInfo: z.string().trim().max(1200).optional(),
  paymentBudgetHints: z.string().trim().max(1200).optional(),
  leadSource: z.string().trim().max(160).optional(),
  timestamps: z.array(z.string().trim().max(120)).default([]),
  priorMessages: z.array(z.string().trim().max(3000)).max(80).default([]),
  conversationTimeline: z.array(leadTimelineEntrySchema).max(60).default([]),
  appointmentStatus: z.string().trim().max(220).optional(),
  salespersonName: z.string().trim().max(160).optional(),
  callRecordingLinks: z.array(z.string().url()).max(5).optional(),
  callTranscript: z.string().trim().max(6000).optional(),
  callNotes: z.string().trim().max(3000).optional(),
  activitySummary: z.string().trim().max(3000).optional(),
  crmAutomationHints: z.array(z.string().trim().max(240)).default([]),
  visibleText: z.string().trim().max(80000).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'unknown']).default('unknown'),
  leadScore: leadTemperatureSchema.default('warm'),
  communicationCompliance: communicationComplianceSchema.optional(),
  customerIntelligence: customerIntelligenceSchema.optional(),
  qualification: qualificationSummarySchema.optional(),
  localResearch: localResearchSchema.optional(),
  parserDebug: parserDebugSchema.optional(),
  extractedAt: z.string().datetime().optional(),
});

export const publicUserSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  signatureName: z.string().trim().max(120).optional(),
  signatureDealershipName: z.string().trim().max(160).optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  displayName: z.string().trim().max(120).optional(),
  dateOfBirth: z.string().datetime().optional(),
  hometown: z.string().trim().max(160).optional(),
  movedHereReason: z.string().trim().max(500).optional(),
  yearsSellingCars: z.number().int().min(0).max(80).nullable().optional(),
  previousCareer: z.string().trim().max(220).optional(),
  militaryService: z.string().trim().max(220).optional(),
  favoriteLocalSpot: z.string().trim().max(220).optional(),
  personalWhy: z.string().trim().max(800).optional(),
  customerBio: z.string().trim().max(900).optional(),
  bioCompletedAt: z.string().datetime().nullable().optional(),
  profileComplete: z.boolean().optional(),
  role: roleSchema,
  accessibleProfileRoles: z.array(profileAccessRoleSchema).max(3).default([]),
  status: userStatusSchema,
  aiEnabled: z.boolean(),
  permissions: z.array(userPermissionSchema).optional(),
  dailyRequestLimit: z.number().int().positive().nullable().optional(),
  bonusDailyRequestLimit: z.number().int().nonnegative().max(100_000).optional(),
  monthlyRequestLimit: z.number().int().positive().nullable().optional(),
  dailyTokenLimit: z.number().int().positive().nullable().optional(),
  creditBalanceMicros: z.number().int().nullable().optional(),
  creditBalanceUsd: z.number().nullable().optional(),
  billingMarkupMultiplier: z.number().nullable().optional(),
  estimatedCreditRequestsRemaining: z.number().int().nonnegative().nullable().optional(),
  estimatedCreditTokensRemaining: z.number().int().nonnegative().nullable().optional(),
  dealershipId: z.string(),
  dealershipName: z.string().optional(),
  dealershipLocation: dealershipLocationSchema.optional(),
});

export const quotaStatusSchema = z.object({
  isUnlimited: z.boolean(),
  dailyRequestsUsed: z.number().int().nonnegative(),
  dailyRequestLimit: z.number().int().positive().nullable(),
  bonusDailyRequestLimit: z.number().int().nonnegative(),
  dailyRequestsRemaining: z.number().int().nonnegative().nullable(),
  monthlyRequestsUsed: z.number().int().nonnegative(),
  monthlyRequestLimit: z.number().int().positive().nullable(),
  monthlyRequestsRemaining: z.number().int().nonnegative().nullable(),
  dailyTokensUsed: z.number().int().nonnegative(),
  dailyTokenLimit: z.number().int().positive().nullable(),
  dailyTokensRemaining: z.number().int().nonnegative().nullable(),
  storeDailyTokensUsed: z.number().int().nonnegative(),
  storeDailyTokenLimit: z.number().int().positive().nullable(),
  storeDailyTokensRemaining: z.number().int().nonnegative().nullable(),
  storeMonthlyTokensUsed: z.number().int().nonnegative(),
  storeMonthlyTokenLimit: z.number().int().positive().nullable(),
  storeMonthlyTokensRemaining: z.number().int().nonnegative().nullable(),
  creditBalanceMicros: z.number().int().nullable().optional(),
  creditBalanceUsd: z.number().nullable().optional(),
  billingMarkupMultiplier: z.number().nullable().optional(),
  estimatedCreditRequestsRemaining: z.number().int().nonnegative().nullable().optional(),
  estimatedCreditTokensRemaining: z.number().int().nonnegative().nullable().optional(),
  refreshedAt: z.string().datetime(),
});

export const billingAmountSchema = z.object({
  amountDollars: z.number().positive().max(1000),
});

export const billingRechargeRequestSchema = billingAmountSchema.extend({
  targetUserId: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});

export const billingSetBalanceRequestSchema = z.object({
  targetUserId: z.string().min(1),
  amountDollars: z.number().nonnegative().max(1000),
  note: z.string().trim().max(300).optional(),
});

export const billingTransferRequestSchema = billingAmountSchema.extend({
  targetUserId: z.string().min(1),
  note: z.string().trim().max(300).optional(),
});

export const billingQuoteResponseSchema = z.object({
  amountDollars: z.number().positive(),
  creditMicros: z.number().int().nonnegative(),
  creditUsd: z.number().nonnegative(),
  customerDollarsPerAppCreditDollar: z.number().positive().optional(),
  role: roleSchema,
  markupMultiplier: z.number().nonnegative(),
  providerCostCapacityUsd: z.number().nonnegative(),
  estimatedRequests: z.number().int().nonnegative().nullable(),
  estimatedTokens: z.number().int().nonnegative(),
});

export const loginRequestSchema = z.object({
  userId: z.string().min(2).max(80),
  password: z.string().min(1).max(200),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: publicUserSchema,
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32),
});

export const createUserRequestSchema = z.object({
  userId: z.string().min(2).max(80),
  email: z.string().email(),
  name: z.string().min(2).max(160),
  signatureName: z.string().trim().min(2).max(120).optional(),
  signatureDealershipName: z.string().trim().min(2).max(160).optional(),
  password: z.string().min(8).max(200),
  role: roleSchema,
  accessibleProfileRoles: z.array(profileAccessRoleSchema).max(3).optional(),
  dealershipId: z.string().optional(),
  aiEnabled: z.boolean().default(true),
  permissions: z.array(userPermissionSchema).optional(),
  dailyRequestLimit: z.number().int().positive().max(100_000).nullable().optional(),
  bonusDailyRequestLimit: z.number().int().nonnegative().max(100_000).optional(),
  monthlyRequestLimit: z.number().int().positive().max(2_000_000).nullable().optional(),
  dailyTokenLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
});

export const updateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).max(160).optional(),
  signatureName: z.string().trim().min(2).max(120).optional(),
  signatureDealershipName: z.string().trim().min(2).max(160).optional(),
  role: roleSchema.optional(),
  accessibleProfileRoles: z.array(profileAccessRoleSchema).max(3).optional(),
  status: userStatusSchema.optional(),
  aiEnabled: z.boolean().optional(),
  permissions: z.array(userPermissionSchema).optional(),
  dailyRequestLimit: z.number().int().positive().max(100_000).nullable().optional(),
  bonusDailyRequestLimit: z.number().int().nonnegative().max(100_000).optional(),
  monthlyRequestLimit: z.number().int().positive().max(2_000_000).nullable().optional(),
  dailyTokenLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const aiGenerateRequestSchema = z.object({
  action: quickActionSchema,
  channel: channelSchema.default('sms'),
  tone: toneSchema.default('standard_closer'),
  roleMode: responseRoleModeSchema.default('salesperson'),
  conversationId: z.string().min(1).max(180),
  leadContext: leadContextSchema,
  dealershipId: z.string().optional(),
  cannedTemplateId: z.string().optional(),
  userDraft: z.string().max(9000).optional(),
});

export const aiFeedbackOutcomeSchema = z.enum([
  'copied',
  'inserted',
  'positive',
  'negative',
  'ignored',
  'finance_path',
  'appointment_path',
  'needs_analysis',
]);

export const aiFeedbackRequestSchema = z.object({
  conversationId: z.string().min(1).max(180),
  channel: channelSchema.default('sms'),
  action: quickActionSchema.optional(),
  selectedText: z.string().trim().min(1).max(3000),
  outcome: aiFeedbackOutcomeSchema,
  reason: z.string().trim().max(500).optional(),
  leadContext: leadContextSchema.optional(),
});

export const draftOptionSchema = z.object({
  label: z.string().max(80),
  text: z.string().max(3000),
  translation: z.string().trim().max(3000).optional(),
  score: z.number().min(0).max(100),
  flags: z.array(z.string()).default([]),
});

export const aiGenerateResponseSchema = z.object({
  conversationId: z.string(),
  nextBestAction: z.string(),
  leadScore: leadTemperatureSchema,
  detectedLanguage: z.string().trim().max(40).optional(),
  customerTranslation: z.string().trim().max(3000).optional(),
  replyTranslation: z.string().trim().max(3000).optional(),
  options: z.array(draftOptionSchema).max(3),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
  }),
  complianceFlags: z.array(z.string()).default([]),
});

export const usageSummarySchema = z.object({
  day: z.string(),
  dealershipId: z.string(),
  userId: z.string().optional(),
  totalTokens: z.number(),
  estimatedCostUsd: z.number(),
  requestCount: z.number(),
});

export const inventoryVehicleSchema = z.object({
  id: z.string(),
  source: z.enum(['new', 'used']),
  title: z.string(),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  trim: z.string().optional(),
  price: z.string().optional(),
  mileage: z.string().optional(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  bodyStyle: z.string().optional(),
  drivetrain: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
  stockNumber: z.string().optional(),
  vin: z.string().optional(),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  windowStickerUrl: z.string().url().optional(),
  carfaxUrl: z.string().url().optional(),
  strategy: z.string(),
  fitScore: z.number().int().min(0).max(100).optional(),
  recommendationReason: z.string().max(500).optional(),
  matchTags: z.array(z.string().max(40)).max(12).optional(),
  sourceMode: z.enum(['browser_live', 'api_live']).optional(),
});

export const inventorySearchResponseSchema = z.object({
  query: z.string().optional(),
  vehicles: z.array(inventoryVehicleSchema),
  counts: z.object({
    totalNew: z.number().int().nonnegative(),
    totalUsed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    matchedNew: z.number().int().nonnegative(),
    matchedUsed: z.number().int().nonnegative(),
    matchedTotal: z.number().int().nonnegative(),
  }).optional(),
  sourceUrls: z.array(z.string().url()),
  fetchedAt: z.string().datetime(),
  live: z.boolean(),
  warning: z.string().optional(),
});

export const workflowRuleSchema = z.object({
  key: z.string().min(2).max(120),
  title: z.string().min(2).max(180),
  config: z.record(z.unknown()),
  isActive: z.boolean().default(true),
});
