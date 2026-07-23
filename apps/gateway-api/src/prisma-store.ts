import { randomBytes, randomUUID } from 'node:crypto';
import {
  AutomationJobStatus,
  ConnectorAuthenticationStatus,
  ConnectorExecutionLocation,
  Prisma,
  PrismaClient,
  type AutomationJob as PrismaAutomationJob,
  type Connector as PrismaConnector,
} from '@prisma/client';
import type {
  AgentHeartbeat,
  AutomationJob,
  ConnectorSummary,
  LeadContextIngest,
  Vehicle,
} from '@drivecentric-ai/shared';
import { hashToken, type GatewayStoreContract } from './store.js';

const liveConnectors = new Set([
  'dealership-website',
  'facebook-marketplace',
  'drivecentric',
  'routeone-bank-brain',
]);

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
    mode: liveConnectors.has(connector.id) ? 'live' : 'skeleton',
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

export class PrismaGatewayStore implements GatewayStoreContract {
  constructor(private readonly prisma = new PrismaClient()) {}

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
        include: { inventoryStatuses: true },
        orderBy: [{ lastSeenAt: 'desc' }, { vin: 'asc' }],
      }),
      this.prisma.connector.findMany({ select: { id: true, displayName: true, currentError: true } }),
    ]);
    const connectorMap = new Map(connectors.map((connector) => [connector.id, connector]));
    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage: vehicle.mileage,
      retailPrice: vehicle.retailPrice ? Number(vehicle.retailPrice) : null,
      cost: vehicle.cost ? Number(vehicle.cost) : null,
      daysInStock: vehicle.daysInStock,
      websiteUrl: vehicle.websiteUrl,
      photos: jsonStringArray(vehicle.photos),
      sourceStatuses: vehicle.inventoryStatuses.map((status) => ({
        connectorId: status.connectorId,
        displayName: connectorMap.get(status.connectorId)?.displayName ?? status.connectorId,
        status: status.status,
        synchronizedAt: status.synchronizedAt.toISOString(),
        error: connectorMap.get(status.connectorId)?.currentError ?? null,
        reauthenticationRequired: false,
        details:
          typeof status.details === 'object' && status.details && !Array.isArray(status.details)
            ? status.details
            : {},
      })),
      salesTalkingPoints: jsonStringArray(vehicle.salesTalkingPoints),
      lastSynchronizedAt: vehicle.lastSeenAt.toISOString(),
    }));
  }

  async getVehicle(vin: string) {
    return (await this.listVehicles()).find((vehicle) => vehicle.vin === vin.toUpperCase());
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

  async createJob(connectorId: string, operation: string, approvalRequired: boolean) {
    const job = await this.prisma.automationJob.create({
      data: {
        connectorId,
        operation,
        idempotencyKey: randomUUID(),
        status: approvalRequired ? AutomationJobStatus.APPROVAL_REQUIRED : AutomationJobStatus.PENDING,
      },
    });
    return automationJob(job);
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
        attemptCount: { increment: 1 },
      },
    });
    return automationJob(leased);
  }

  async completeJob(jobId: string, success: boolean, result: unknown) {
    const updated = await this.prisma.automationJob.updateMany({
      where: { id: jobId, status: { in: [AutomationJobStatus.LEASED, AutomationJobStatus.RUNNING] } },
      data: {
        status: success ? AutomationJobStatus.SUCCEEDED : AutomationJobStatus.FAILED,
        finishedAt: new Date(),
        result: success ? (result as Prisma.InputJsonValue) : Prisma.JsonNull,
        error: success ? Prisma.JsonNull : (result as Prisma.InputJsonValue),
      },
    });
    return updated.count === 1;
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
