import { z } from 'zod';

export const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN must be 17 characters and cannot contain I, O, or Q');

export const connectorCapabilitySchema = z.enum(['read', 'write', 'download', 'upload']);
export const connectorExecutionLocationSchema = z.enum(['railway', 'local-agent', 'extension']);
export const connectorModeSchema = z.enum(['live', 'fixture', 'recording', 'skeleton']);
export const connectorErrorTypeSchema = z.enum([
  'configuration',
  'authentication',
  'reauthentication_required',
  'authorization',
  'validation',
  'selector_changed',
  'network',
  'rate_limited',
  'portal_unavailable',
  'parse',
  'timeout',
  'cancelled',
  'internal',
]);

export const connectorMetadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(connectorCapabilitySchema).min(1),
  executionLocation: connectorExecutionLocationSchema,
  mode: connectorModeSchema,
  approvalRequiredForWrites: z.boolean().default(true),
});

export const connectorArtifactSchema = z.object({
  kind: z.enum(['screenshot', 'html-snapshot', 'download', 'log']),
  path: z.string().min(1),
  sanitized: z.boolean(),
});

export const connectorHealthSchema = z.object({
  connectorId: z.string().min(1),
  ok: z.boolean(),
  checkedAt: z.string().datetime(),
  authenticationStatus: z.enum([
    'not-configured',
    'authenticated',
    'reauthentication-required',
    'error',
  ]),
  message: z.string().optional(),
  reauthenticationRequired: z.boolean().default(false),
  details: z.record(z.unknown()).default({}),
});

export const connectorSyncResultSchema = z
  .object({
    connectorId: z.string().min(1),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    success: z.boolean(),
    recordsFound: z.number().int().nonnegative(),
    recordsCreated: z.number().int().nonnegative(),
    recordsUpdated: z.number().int().nonnegative(),
    recordsSkipped: z.number().int().nonnegative(),
    errorType: connectorErrorTypeSchema.optional(),
    errorMessage: z.string().min(1).optional(),
    artifacts: z.array(connectorArtifactSchema).default([]),
    screenshotPath: z.string().min(1).optional(),
    htmlSnapshotPath: z.string().min(1).optional(),
    reauthenticationRequired: z.boolean(),
    retryCount: z.number().int().nonnegative(),
    lastSuccessfulSyncAt: z.string().datetime().optional(),
    records: z.array(z.unknown()).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    const start = Date.parse(value.startedAt);
    const finish = Date.parse(value.finishedAt);
    if (finish < start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finishedAt'],
        message: 'finishedAt cannot be before startedAt',
      });
    }
    if (!value.success && !value.errorType) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['errorType'],
        message: 'failed connector results require an error type',
      });
    }
    if (!value.success && !value.errorMessage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['errorMessage'],
        message: 'failed connector results require an error message',
      });
    }
  });

export const connectorSummarySchema = z.object({
  ...connectorMetadataSchema.shape,
  enabled: z.boolean(),
  authenticationStatus: connectorHealthSchema.shape.authenticationStatus,
  lastSuccessfulSync: z.string().datetime().nullable(),
  lastAttemptedSync: z.string().datetime().nullable(),
  lastDurationMs: z.number().int().nonnegative().nullable(),
  recordsUpdated: z.number().int().nonnegative(),
  currentError: z.string().nullable(),
  reauthenticationRequired: z.boolean(),
  logsUrl: z.string(),
  failureScreenshotUrl: z.string().nullable(),
});

export const vehicleSourceStatusSchema = z.object({
  connectorId: z.string(),
  displayName: z.string(),
  status: z.string(),
  synchronizedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  reauthenticationRequired: z.boolean().default(false),
  details: z.record(z.unknown()).default({}),
});

export const vehicleSchema = z.object({
  id: z.string(),
  vin: vinSchema,
  title: z.string().nullable().optional(),
  stockNumber: z.string().nullable(),
  year: z.number().int().min(1886).max(2200).nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  trim: z.string().nullable(),
  condition: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  mileage: z.number().int().nonnegative().nullable(),
  retailPrice: z.number().nonnegative().nullable(),
  msrp: z.number().nonnegative().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  jdPowerTradeIn: z.number().nonnegative().nullable().optional(),
  loanToValue: z.number().nonnegative().nullable().optional(),
  ltvBasis: z.number().nonnegative().nullable().optional(),
  reconStage: z.string().nullable().optional(),
  reconOpenWork: z.array(z.string()).optional(),
  frontlineReady: z.boolean().nullable().optional(),
  keyLocation: z.string().nullable().optional(),
  keyHolder: z.string().nullable().optional(),
  daysInStock: z.number().int().nonnegative().nullable(),
  websiteUrl: z.string().url().nullable(),
  photos: z.array(z.string().url()).default([]),
  exteriorColor: z.string().nullable().optional(),
  interiorColor: z.string().nullable().optional(),
  drivetrain: z.string().nullable().optional(),
  engine: z.string().nullable().optional(),
  transmission: z.string().nullable().optional(),
  bodyStyle: z.string().nullable().optional(),
  fuelType: z.string().nullable().optional(),
  powertrainType: z.string().nullable().optional(),
  mpgCity: z.number().nonnegative().nullable().optional(),
  mpgHighway: z.number().nonnegative().nullable().optional(),
  mpgCombined: z.number().nonnegative().nullable().optional(),
  estimatedRangeMiles: z.number().nonnegative().nullable().optional(),
  electricRangeMiles: z.number().nonnegative().nullable().optional(),
  fuelTankGallons: z.number().nonnegative().nullable().optional(),
  seatingCapacity: z.number().int().nonnegative().nullable().optional(),
  thirdRowSeats: z.boolean().nullable().optional(),
  maxTowingCapacity: z.number().nonnegative().nullable().optional(),
  curbWeight: z.number().nonnegative().nullable().optional(),
  horsepower: z.number().nonnegative().nullable().optional(),
  torque: z.number().nonnegative().nullable().optional(),
  metadataLoadedAt: z.string().datetime().nullable().optional(),
  metadataComplete: z.boolean().optional(),
  searchFacts: z.array(z.string()).optional(),
  sourceStatuses: z.array(vehicleSourceStatusSchema).default([]),
  salesTalkingPoints: z.array(z.string()).default([]),
  lastSynchronizedAt: z.string().datetime().nullable(),
});

export const inventorySourceSummarySchema = z.object({
  mode: z.enum(['legacy-live', 'gateway-database', 'fixture']),
  label: z.string(),
  live: z.boolean(),
  stale: z.boolean(),
  configured: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  inTransitCount: z.number().int().nonnegative(),
  synchronizedAt: z.string().datetime().nullable(),
  warning: z.string().nullable(),
  details: z.record(z.unknown()).default({}),
});

export const inventoryResponseSchema = z.object({
  items: z.array(vehicleSchema),
  count: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  inTransitCount: z.number().int().nonnegative(),
  source: inventorySourceSummarySchema,
});

export const leadContextIngestSchema = z.object({
  source: z.literal('drivecentric'),
  externalLeadId: z.string().optional(),
  externalCustomerId: z.string().optional(),
  conversationId: z.string().min(1),
  customer: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
  vehicleInterest: z
    .object({
      vin: vinSchema.optional(),
      stockNumber: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  conversation: z.array(
    z.object({
      externalId: z.string().optional(),
      direction: z.enum(['inbound', 'outbound', 'internal', 'unknown']),
      channel: z.string(),
      sender: z.string().optional(),
      body: z.string().max(10_000),
      sentAt: z.string().datetime(),
    }),
  ),
  extractedAt: z.string().datetime(),
  rawContext: z.record(z.unknown()).default({}),
});

export const deviceRegistrationSchema = z.object({
  name: z.string().min(1).max(120),
  platform: z.literal('windows'),
  registrationCode: z.string().min(16),
  capabilities: z.array(z.string()).default([]),
});

export const agentHeartbeatSchema = z.object({
  deviceId: z.string().min(1),
  agentVersion: z.string().min(1),
  sentAt: z.string().datetime(),
  status: z.enum(['online', 'busy', 'degraded']),
  capabilities: z.array(z.string()),
  activeJobId: z.string().optional(),
});

export const automationJobSchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  operation: z.string(),
  payload: z.record(z.unknown()),
  approvalStatus: z.enum(['not-required', 'required', 'approved']),
  leaseExpiresAt: z.string().datetime(),
  idempotencyKey: z.string(),
});

export const automationJobStatusSchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  operation: z.string(),
  status: z.enum([
    'pending',
    'approval-required',
    'approved',
    'leased',
    'running',
    'succeeded',
    'failed',
    'cancelled',
  ]),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).nullable(),
  error: z.record(z.unknown()).nullable(),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});

export type ConnectorMetadata = z.infer<typeof connectorMetadataSchema>;
export type ConnectorHealth = z.infer<typeof connectorHealthSchema>;
export type ConnectorSyncResult = z.infer<typeof connectorSyncResultSchema>;
export type ConnectorSummary = z.infer<typeof connectorSummarySchema>;
export type Vehicle = z.infer<typeof vehicleSchema>;
export type InventorySourceSummary = z.infer<typeof inventorySourceSummarySchema>;
export type InventoryResponse = z.infer<typeof inventoryResponseSchema>;
export type LeadContextIngest = z.infer<typeof leadContextIngestSchema>;
export type AgentHeartbeat = z.infer<typeof agentHeartbeatSchema>;
export type AutomationJob = z.infer<typeof automationJobSchema>;
export type AutomationJobStatus = z.infer<typeof automationJobStatusSchema>;
