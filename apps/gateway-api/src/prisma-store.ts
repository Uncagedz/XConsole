import { randomBytes, randomUUID } from 'node:crypto';
import {
  AutomationJobStatus,
  ConnectorAuthenticationStatus,
  ConnectorExecutionLocation,
  ConnectorRunStatus,
  Prisma,
  PrismaClient,
  type AutomationJob as PrismaAutomationJob,
  type Connector as PrismaConnector,
} from '@prisma/client';
import type {
  AgentHeartbeat,
  AutomationJob,
  AutomationJobStatus as AutomationJobStatusContract,
  ConnectorSummary,
  LeadContextIngest,
  Vehicle,
} from '@drivecentric-ai/shared';
import { connectorSeeds } from './seed-data.js';
import { hashToken, type GatewayStoreContract } from './store.js';

const liveConnectors = new Set([
  'dealership-website',
  'facebook-marketplace',
  'drivecentric',
  'routeone-bank-brain',
]);
const recordingConnectors = new Set(['reconvision', 'onemicro']);

const executionLocation = {
  [ConnectorExecutionLocation.RAILWAY]: 'railway',
  [ConnectorExecutionLocation.LOCAL_AGENT]: 'local-agent',
  [ConnectorExecutionLocation.EXTENSION]: 'extension',
} as const;

const authenticationStatus = {
  [ConnectorAuthenticationStatus.NOT_CONFIGURED]: 'not-configured',
  [ConnectorAuthenticationStatus.AUTHENTICATED]: 'authenticated',
  [ConnectorAuthenticationStatus.REAUTHENTICATION_REQUIRED]: 'reauthentication-required',
  [ConnectorAuthenticationStatus.ERROR]: 'error',
} as const;

function connectorSummary(connector: PrismaConnector): ConnectorSummary {
  return {
    id: connector.id,
    displayName: connector.displayName,
    description: `${connector.displayName} XConsole connector`,
    capabilities: connector.capabilities as ConnectorSummary['capabilities'],
    executionLocation: executionLocation[connector.executionLocation],
    mode: liveConnectors.has(connector.id)
      ? 'live'
      : recordingConnectors.has(connector.id)
        ? 'recording'
        : 'skeleton',
    approvalRequiredForWrites: true,
    enabled: connector.enabled,
    authenticationStatus: authenticationStatus[connector.authenticationStatus],
    lastSuccessfulSync: connector.lastSuccessfulAt?.toISOString() ?? null,
    lastAttemptedSync: connector.lastAttemptedAt?.toISOString() ?? null,
    lastDurationMs: connector.lastDurationMs,
    recordsUpdated: connector.lastRecordsUpdated,
    currentError: connector.currentError,
    reauthenticationRequired: connector.reauthenticationRequired,
    logsUrl: `/api/connectors/${connector.id}/runs`,
    failureScreenshotUrl: null,
  };
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function jsonRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function nullableString(value: Prisma.JsonValue | undefined) {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function inventoryDetails(vehicle: Vehicle, details: Record<string, unknown>) {
  return Object.fromEntries(Object.entries({
    ...details,
    title: vehicle.title,
    condition: vehicle.condition,
    exteriorColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    drivetrain: vehicle.drivetrain,
    engine: vehicle.engine,
    transmission: vehicle.transmission,
    msrp: vehicle.msrp,
  }).filter(([, value]) => value !== undefined)) as Prisma.InputJsonObject;
}

function isListedStatus(status: string) {
  return !/(?:sold|inactive|removed|deleted)/i.test(status);
}

function automationJob(job: PrismaAutomationJob): AutomationJob {
  return {
    id: job.id,
    connectorId: job.connectorId,
    operation: job.operation,
    payload: typeof job.payload === 'object' && job.payload && !Array.isArray(job.payload) ? job.payload : {},
    approvalStatus:
      job.status === AutomationJobStatus.APPROVAL_REQUIRED
        ? 'required'
        : job.approvedAt
          ? 'approved'
          : 'not-required',
    leaseExpiresAt: (job.leasedUntil ?? job.scheduledAt).toISOString(),
    idempotencyKey: job.idempotencyKey,
  };
}

const automationJobStatus = {
  [AutomationJobStatus.PENDING]: 'pending',
  [AutomationJobStatus.APPROVAL_REQUIRED]: 'approval-required',
  [AutomationJobStatus.APPROVED]: 'approved',
  [AutomationJobStatus.LEASED]: 'leased',
  [AutomationJobStatus.RUNNING]: 'running',
  [AutomationJobStatus.SUCCEEDED]: 'succeeded',
  [AutomationJobStatus.FAILED]: 'failed',
  [AutomationJobStatus.CANCELLED]: 'cancelled',
} as const;
const connectorLocation = {
  railway: ConnectorExecutionLocation.RAILWAY,
  'local-agent': ConnectorExecutionLocation.LOCAL_AGENT,
  extension: ConnectorExecutionLocation.EXTENSION,
} as const;

function automationJobDetails(job: PrismaAutomationJob): AutomationJobStatusContract {
  return {
    id: job.id,
    connectorId: job.connectorId,
    operation: job.operation,
    status: automationJobStatus[job.status],
    payload: jsonRecord(job.payload),
    result: job.result === null ? null : jsonRecord(job.result),
    error: job.error === null ? null : jsonRecord(job.error),
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export class PrismaGatewayStore implements GatewayStoreContract {
  constructor(private readonly prisma = new PrismaClient()) {}

  async initialize() {
    await Promise.all(connectorSeeds.map((connector) => this.prisma.connector.upsert({
      where: { id: connector.id },
      create: {
        id: connector.id,
        displayName: connector.displayName,
        enabled: connector.enabled,
        executionLocation: connectorLocation[connector.executionLocation],
        authenticationStatus: connector.enabled
          ? ConnectorAuthenticationStatus.AUTHENTICATED
          : ConnectorAuthenticationStatus.NOT_CONFIGURED,
        capabilities: connector.capabilities,
      },
      update: {
        displayName: connector.displayName,
        executionLocation: connectorLocation[connector.executionLocation],
        capabilities: connector.capabilities,
      },
    })));
  }

  async listConnectors() {
    return (await this.prisma.connector.findMany({ orderBy: { displayName: 'asc' } })).map(connectorSummary);
  }

  async getConnector(id: string) {
    const connector = await this.prisma.connector.findUnique({ where: { id } });
    return connector ? connectorSummary(connector) : undefined;
  }

  async updateConnector(id: string, patch: Partial<Pick<ConnectorSummary, 'enabled'>>) {
    const existing = await this.prisma.connector.findUnique({ where: { id } });
    if (!existing) return undefined;
    return connectorSummary(
      await this.prisma.connector.update({
        where: { id },
        data: { enabled: patch.enabled },
      }),
    );
  }

  async listVehicles(): Promise<Vehicle[]> {
    const [vehicles, connectors] = await Promise.all([
      this.prisma.vehicle.findMany({
        include: {
          inventoryStatuses: true,
          reconRecords: { orderBy: { observedAt: 'desc' }, take: 1 },
          keyRecords: { orderBy: { observedAt: 'desc' }, take: 1 },
        },
        orderBy: [{ lastSeenAt: 'desc' }, { vin: 'asc' }],
      }),
      this.prisma.connector.findMany({ select: { id: true, displayName: true, currentError: true } }),
    ]);
    const connectorMap = new Map(connectors.map((connector) => [connector.id, connector]));
    return vehicles.map((vehicle) => {
      const websiteStatus = vehicle.inventoryStatuses.find((status) => status.connectorId === 'dealership-website');
      const details = jsonRecord(websiteStatus?.details ?? {});
      const recon = vehicle.reconRecords[0];
      const key = vehicle.keyRecords[0];
      return {
        id: vehicle.id,
        vin: vehicle.vin,
        title: nullableString(details.title),
        stockNumber: vehicle.stockNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        condition: nullableString(details.condition),
        status: websiteStatus?.status ?? null,
        mileage: vehicle.mileage,
        retailPrice: vehicle.retailPrice ? Number(vehicle.retailPrice) : null,
        msrp: nullableNumber(details.msrp),
        cost: vehicle.cost ? Number(vehicle.cost) : null,
        reconStage: recon?.stage ?? null,
        reconOpenWork: recon ? jsonStringArray(recon.openWork) : [],
        frontlineReady: recon?.completedAt ? true : null,
        keyLocation: key?.location ?? null,
        keyHolder: key?.holder ?? null,
        daysInStock: vehicle.daysInStock,
        websiteUrl: vehicle.websiteUrl,
        photos: jsonStringArray(vehicle.photos),
        exteriorColor: nullableString(details.exteriorColor),
        interiorColor: nullableString(details.interiorColor),
        drivetrain: nullableString(details.drivetrain),
        engine: nullableString(details.engine),
        transmission: nullableString(details.transmission),
        sourceStatuses: [
          ...vehicle.inventoryStatuses.map((status) => ({
            connectorId: status.connectorId,
            displayName: connectorMap.get(status.connectorId)?.displayName ?? status.connectorId,
            status: status.status,
            synchronizedAt: status.synchronizedAt.toISOString(),
            error: connectorMap.get(status.connectorId)?.currentError ?? null,
            reauthenticationRequired: false,
            details: jsonRecord(status.details),
          })),
          ...(recon && !vehicle.inventoryStatuses.some((status) => status.connectorId === 'reconvision')
            ? [{
                connectorId: 'reconvision',
                displayName: connectorMap.get('reconvision')?.displayName ?? 'ReconVision',
                status: recon.stage ?? 'synchronized',
                synchronizedAt: recon.observedAt.toISOString(),
                error: connectorMap.get('reconvision')?.currentError ?? null,
                reauthenticationRequired: false,
                details: {
                  stage: recon.stage,
                  openWork: jsonStringArray(recon.openWork),
                  frontlineReady: Boolean(recon.completedAt),
                },
              }]
            : []),
          ...(key && !vehicle.inventoryStatuses.some((status) => status.connectorId === 'onemicro')
            ? [{
                connectorId: 'onemicro',
                displayName: connectorMap.get('onemicro')?.displayName ?? '1Micro',
                status: key.location ? 'located' : 'synchronized',
                synchronizedAt: key.observedAt.toISOString(),
                error: connectorMap.get('onemicro')?.currentError ?? null,
                reauthenticationRequired: false,
                details: { location: key.location, holder: key.holder },
              }]
            : []),
        ],
        salesTalkingPoints: jsonStringArray(vehicle.salesTalkingPoints),
        lastSynchronizedAt: vehicle.lastSeenAt.toISOString(),
      };
    });
  }

  async getVehicle(vin: string) {
    return (await this.listVehicles()).find((vehicle) => vehicle.vin === vin.toUpperCase());
  }

  async upsertVehicles(vehicles: Vehicle[]) {
    const existing = new Set(
      (await this.prisma.vehicle.findMany({
        where: { vin: { in: vehicles.map((vehicle) => vehicle.vin) } },
        select: { vin: true },
      })).map((vehicle) => vehicle.vin),
    );
    const synchronizedAt = new Date();
    const batchSize = 40;
    for (let offset = 0; offset < vehicles.length; offset += batchSize) {
      const batch = vehicles.slice(offset, offset + batchSize);
      await Promise.all(batch.map(async (vehicle) => {
        const stored = await this.prisma.vehicle.upsert({
          where: { vin: vehicle.vin },
          create: {
            vin: vehicle.vin,
            stockNumber: vehicle.stockNumber,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            trim: vehicle.trim,
            mileage: vehicle.mileage,
            retailPrice: vehicle.retailPrice,
            cost: vehicle.cost,
            daysInStock: vehicle.daysInStock,
            websiteUrl: vehicle.websiteUrl,
            photos: vehicle.photos,
            salesTalkingPoints: vehicle.salesTalkingPoints,
            lastSeenAt: synchronizedAt,
          },
          update: {
            stockNumber: vehicle.stockNumber,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            trim: vehicle.trim,
            mileage: vehicle.mileage,
            retailPrice: vehicle.retailPrice,
            cost: vehicle.cost,
            daysInStock: vehicle.daysInStock,
            websiteUrl: vehicle.websiteUrl,
            photos: vehicle.photos,
            salesTalkingPoints: vehicle.salesTalkingPoints,
            lastSeenAt: synchronizedAt,
          },
        });
        const website = vehicle.sourceStatuses.find((status) => status.connectorId === 'dealership-website');
        if (website) {
          await this.prisma.inventoryStatus.upsert({
            where: {
              vehicleId_connectorId: {
                vehicleId: stored.id,
                connectorId: website.connectorId,
              },
            },
            create: {
              vehicleId: stored.id,
              connectorId: website.connectorId,
              status: website.status,
              listed: isListedStatus(website.status),
              price: vehicle.retailPrice,
              sourceUrl: vehicle.websiteUrl,
              synchronizedAt: website.synchronizedAt ? new Date(website.synchronizedAt) : synchronizedAt,
              details: inventoryDetails(vehicle, website.details),
            },
            update: {
              status: website.status,
              listed: isListedStatus(website.status),
              price: vehicle.retailPrice,
              sourceUrl: vehicle.websiteUrl,
              synchronizedAt: website.synchronizedAt ? new Date(website.synchronizedAt) : synchronizedAt,
              details: inventoryDetails(vehicle, website.details),
            },
          });
        }
      }));
    }
    const created = vehicles.filter((vehicle) => !existing.has(vehicle.vin)).length;
    const updated = vehicles.length - created;
    await this.prisma.connector.updateMany({
      where: { id: 'dealership-website' },
      data: {
        lastAttemptedAt: synchronizedAt,
        lastSuccessfulAt: synchronizedAt,
        lastRecordsUpdated: vehicles.length,
        currentError: null,
        reauthenticationRequired: false,
      },
    });
    return { created, updated };
  }

  async registerDevice(name: string) {
    const token = randomBytes(32).toString('base64url');
    const device = await this.prisma.device.create({
      data: {
        userId: 'owner',
        name,
        platform: 'windows',
        tokenHash: hashToken(token),
        capabilities: ['playwright', 'selenium-adapter', 'recording'],
        encryptedConfigFormat: 'windows-dpapi-current-user',
      },
    });
    return { deviceId: device.id, deviceToken: token };
  }

  async authenticateDevice(token: string) {
    return (
      (await this.prisma.device.findFirst({
        where: { tokenHash: hashToken(token), revokedAt: null },
        select: { id: true },
      })) ?? undefined
    );
  }

  async listDevices() {
    const devices = await this.prisma.device.findMany({
      where: { revokedAt: null },
      orderBy: { registeredAt: 'desc' },
    });
    return devices.map((device) => ({
      id: device.id,
      name: device.name,
      ...(device.lastHeartbeat && typeof device.lastHeartbeat === 'object' && !Array.isArray(device.lastHeartbeat)
        ? { lastHeartbeat: device.lastHeartbeat as unknown as AgentHeartbeat }
        : {}),
    }));
  }

  async heartbeat(deviceId: string, heartbeat: AgentHeartbeat) {
    const result = await this.prisma.device.updateMany({
      where: { id: deviceId, revokedAt: null },
      data: {
        lastHeartbeatAt: new Date(heartbeat.sentAt),
        lastHeartbeat: heartbeat as unknown as Prisma.InputJsonValue,
      },
    });
    return result.count === 1;
  }

  async createJob(
    connectorId: string,
    operation: string,
    approvalRequired: boolean,
    payload: Record<string, unknown> = {},
  ) {
    const job = await this.prisma.automationJob.create({
      data: {
        connectorId,
        operation,
        payload: payload as Prisma.InputJsonObject,
        idempotencyKey: randomUUID(),
        status: approvalRequired ? AutomationJobStatus.APPROVAL_REQUIRED : AutomationJobStatus.PENDING,
      },
    });
    return automationJob(job);
  }

  async getJob(jobId: string) {
    const job = await this.prisma.automationJob.findUnique({ where: { id: jobId } });
    return job ? automationJobDetails(job) : undefined;
  }

  async leaseJob() {
    const candidate = await this.prisma.automationJob.findFirst({
      where: {
        status: { in: [AutomationJobStatus.PENDING, AutomationJobStatus.APPROVED] },
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    if (!candidate) return null;
    const leased = await this.prisma.automationJob.update({
      where: { id: candidate.id },
      data: {
        status: AutomationJobStatus.LEASED,
        leasedUntil: new Date(Date.now() + 60_000),
        startedAt: candidate.startedAt ?? new Date(),
        attemptCount: { increment: 1 },
      },
    });
    return automationJob(leased);
  }

  async completeJob(jobId: string, success: boolean, result: unknown) {
    const job = await this.prisma.automationJob.findUnique({ where: { id: jobId } });
    if (
      !job
      || (job.status !== AutomationJobStatus.LEASED && job.status !== AutomationJobStatus.RUNNING)
    ) return false;
    const finishedAt = new Date();
    const resultRecord = typeof result === 'object' && result !== null && !Array.isArray(result)
      ? result as Record<string, unknown>
      : { value: result };
    const resultJson = resultRecord as Prisma.InputJsonObject;
    const updated = await this.prisma.automationJob.updateMany({
      where: { id: jobId, status: { in: [AutomationJobStatus.LEASED, AutomationJobStatus.RUNNING] } },
      data: {
        status: success ? AutomationJobStatus.SUCCEEDED : AutomationJobStatus.FAILED,
        finishedAt,
        result: success ? resultJson : Prisma.JsonNull,
        error: success ? Prisma.JsonNull : resultJson,
      },
    });
    if (updated.count !== 1) return false;

    const durationMs = Math.max(0, finishedAt.getTime() - (job.startedAt ?? job.createdAt).getTime());
    const errorMessage = typeof resultRecord.message === 'string'
      ? resultRecord.message
      : typeof resultRecord.error === 'string'
        ? resultRecord.error
        : success
          ? null
          : 'Local Agent job failed';
    const reauthenticationRequired = resultRecord.reauthenticationRequired === true;
    await Promise.all([
      this.prisma.connector.update({
        where: { id: job.connectorId },
        data: success
          ? {
              authenticationStatus: ConnectorAuthenticationStatus.AUTHENTICATED,
              lastAttemptedAt: finishedAt,
              lastSuccessfulAt: finishedAt,
              lastDurationMs: durationMs,
              lastRecordsUpdated: 1,
              currentError: null,
              reauthenticationRequired: false,
            }
          : {
              authenticationStatus: reauthenticationRequired
                ? ConnectorAuthenticationStatus.REAUTHENTICATION_REQUIRED
                : ConnectorAuthenticationStatus.ERROR,
              lastAttemptedAt: finishedAt,
              lastDurationMs: durationMs,
              lastRecordsUpdated: 0,
              currentError: errorMessage,
              reauthenticationRequired,
            },
      }),
      this.prisma.connectorRun.create({
        data: {
          connectorId: job.connectorId,
          status: success ? ConnectorRunStatus.SUCCEEDED : ConnectorRunStatus.FAILED,
          startedAt: job.startedAt ?? job.createdAt,
          finishedAt,
          durationMs,
          recordsFound: success ? 1 : 0,
          recordsUpdated: success ? 1 : 0,
          errorType: success ? null : String(resultRecord.errorType ?? 'internal'),
          errorMessage,
          screenshotPath: typeof resultRecord.screenshotPath === 'string' ? resultRecord.screenshotPath : null,
          htmlSnapshotPath: typeof resultRecord.htmlSnapshotPath === 'string' ? resultRecord.htmlSnapshotPath : null,
          reauthenticationRequired,
          retryCount: Math.max(0, job.attemptCount - 1),
          lastSuccessfulSyncAt: success ? finishedAt : null,
          metadata: { jobId: job.id, operation: job.operation },
        },
      }),
    ]);

    if (success && job.operation === 'lookup-vin') {
      const payload = jsonRecord(job.payload);
      const vin = typeof payload.vin === 'string' ? payload.vin : '';
      const fields = typeof resultRecord.fields === 'object' && resultRecord.fields !== null && !Array.isArray(resultRecord.fields)
        ? resultRecord.fields as Record<string, unknown>
        : {};
      const vehicle = vin ? await this.prisma.vehicle.findUnique({ where: { vin } }) : null;
      if (vehicle && job.connectorId === 'reconvision') {
        const openWork = Array.isArray(fields.openWork)
          ? fields.openWork.filter((item): item is string => typeof item === 'string')
          : typeof fields.openWork === 'string'
            ? fields.openWork.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean)
            : [];
        await this.prisma.reconRecord.create({
          data: {
            vehicleId: vehicle.id,
            connectorId: job.connectorId,
            stage: typeof fields.stage === 'string' ? fields.stage : null,
            openWork,
            completedAt: fields.frontlineReady === true ? finishedAt : null,
            observedAt: finishedAt,
          },
        });
      }
      if (vehicle && job.connectorId === 'onemicro') {
        await this.prisma.keyRecord.create({
          data: {
            vehicleId: vehicle.id,
            connectorId: job.connectorId,
            location: typeof fields.location === 'string' ? fields.location : null,
            holder: typeof fields.holder === 'string' ? fields.holder : null,
            observedAt: finishedAt,
          },
        });
      }
    }
    return true;
  }

  async ingestDriveCentric(context: LeadContextIngest) {
    const vehicle = context.vehicleInterest?.vin
      ? await this.prisma.vehicle.findUnique({ where: { vin: context.vehicleInterest.vin } })
      : null;
    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        OR: [
          ...(context.customer.email ? [{ email: context.customer.email }] : []),
          ...(context.customer.phone ? [{ phone: context.customer.phone }] : []),
          ...(context.externalCustomerId
            ? [{ externalIds: { path: ['drivecentric'], equals: context.externalCustomerId } }]
            : []),
        ],
      },
    });
    const customer = existingCustomer
      ? await this.prisma.customer.update({
          where: { id: existingCustomer.id },
          data: {
            name: context.customer.name,
            phone: context.customer.phone,
            email: context.customer.email,
            externalIds: context.externalCustomerId
              ? ({ drivecentric: context.externalCustomerId } as Prisma.InputJsonValue)
              : undefined,
            lastContactAt: new Date(),
          },
        })
      : await this.prisma.customer.create({
          data: {
            name: context.customer.name,
            phone: context.customer.phone,
            email: context.customer.email,
            externalIds: context.externalCustomerId
              ? ({ drivecentric: context.externalCustomerId } as Prisma.InputJsonValue)
              : {},
            lastContactAt: new Date(),
          },
        });

    let lead = context.externalLeadId
      ? await this.prisma.lead.findFirst({ where: { source: 'drivecentric', externalId: context.externalLeadId } })
      : null;
    if (!lead) {
      lead = await this.prisma.lead.create({
        data: {
          customerId: customer.id,
          vehicleId: vehicle?.id,
          source: 'drivecentric',
          externalId: context.externalLeadId,
          status: 'active',
          context: context as unknown as Prisma.InputJsonValue,
          lastActivityAt: new Date(),
        },
      });
    } else {
      lead = await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          customerId: customer.id,
          vehicleId: vehicle?.id,
          context: context as unknown as Prisma.InputJsonValue,
          lastActivityAt: new Date(),
        },
      });
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: { externalId: context.conversationId, customerId: customer.id },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          customerId: customer.id,
          leadId: lead.id,
          externalId: context.conversationId,
          channel: context.conversation[0]?.channel ?? 'unknown',
        },
      });
    }
    for (const message of context.conversation) {
      const sentAt = new Date(message.sentAt);
      const duplicate = await this.prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          ...(message.externalId
            ? { externalId: message.externalId }
            : { body: message.body, sentAt }),
        },
      });
      if (!duplicate) {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            externalId: message.externalId,
            direction: message.direction,
            channel: message.channel,
            sender: message.sender,
            body: message.body,
            sentAt,
          },
        });
      }
    }
    return { stored: true, totalContexts: await this.prisma.conversation.count() };
  }

  async close() {
    await this.prisma.$disconnect();
  }
}
