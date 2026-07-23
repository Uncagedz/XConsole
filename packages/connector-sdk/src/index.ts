import {
  connectorHealthSchema,
  connectorSyncResultSchema,
  type ConnectorHealth,
  type ConnectorMetadata,
  type ConnectorSyncResult,
} from '@drivecentric-ai/shared';
import type { ZodType, ZodTypeDef } from 'zod';

export interface ConnectorLogger {
  info(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

export interface ConnectorContext<TConfig> {
  config: TConfig;
  runId: string;
  attempt: number;
  approved: boolean;
  signal: AbortSignal;
  logger: ConnectorLogger;
  artifactsDirectory?: string;
}

export interface XConsoleConnector<TConfig = unknown, TRecord = unknown> {
  readonly metadata: ConnectorMetadata;
  readonly configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  healthCheck(context: ConnectorContext<TConfig>): Promise<ConnectorHealth>;
  sync(context: ConnectorContext<TConfig>): Promise<ConnectorSyncResult & { records: TRecord[] }>;
}

export class ConnectorExecutionError extends Error {
  constructor(
    readonly type: ConnectorSyncResult['errorType'],
    message: string,
    readonly reauthenticationRequired = false,
    readonly artifactPaths: { screenshotPath?: string; htmlSnapshotPath?: string } = {},
  ) {
    super(message);
    this.name = 'ConnectorExecutionError';
  }
}

export async function runConnector<TConfig, TRecord>(
  connector: XConsoleConnector<TConfig, TRecord>,
  context: ConnectorContext<TConfig>,
): Promise<ConnectorSyncResult & { records: TRecord[] }> {
  const startedAt = new Date();
  const config = connector.configSchema.parse(context.config);
  try {
    if (connector.metadata.capabilities.includes('write') && !context.approved) {
      throw new ConnectorExecutionError(
        'authorization',
        `${connector.metadata.displayName} write operations require explicit approval`,
      );
    }
    const result = await connector.sync({ ...context, config });
    return connectorSyncResultSchema.parse(result) as ConnectorSyncResult & { records: TRecord[] };
  } catch (error) {
    const finishedAt = new Date();
    const classified =
      error instanceof ConnectorExecutionError
        ? error
        : new ConnectorExecutionError('internal', error instanceof Error ? error.message : 'Unknown connector error');
    context.logger.error('connector.sync.failed', {
      connectorId: connector.metadata.id,
      runId: context.runId,
      errorType: classified.type,
      reauthenticationRequired: classified.reauthenticationRequired,
    });
    return connectorSyncResultSchema.parse({
      connectorId: connector.metadata.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      success: false,
      recordsFound: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errorType: classified.type ?? 'internal',
      errorMessage: classified.message,
      screenshotPath: classified.artifactPaths.screenshotPath,
      htmlSnapshotPath: classified.artifactPaths.htmlSnapshotPath,
      reauthenticationRequired: classified.reauthenticationRequired,
      retryCount: Math.max(0, context.attempt - 1),
      records: [],
    }) as ConnectorSyncResult & { records: TRecord[] };
  }
}

export function validateConnectorHealth(value: unknown) {
  return connectorHealthSchema.parse(value);
}

export function createSkeletonConnector<TConfig extends Record<string, unknown>>({
  metadata,
  configSchema,
  fixtureRecords = [],
  requiredPortalInformation,
}: {
  metadata: ConnectorMetadata;
  configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  fixtureRecords?: unknown[];
  requiredPortalInformation: string[];
}): XConsoleConnector<TConfig> & { requiredPortalInformation: string[] } {
  return {
    metadata,
    configSchema,
    requiredPortalInformation,
    async healthCheck(context) {
      const fixtureMode = (context.config as { mode?: string }).mode === 'fixture';
      return connectorHealthSchema.parse({
        connectorId: metadata.id,
        ok: fixtureMode,
        checkedAt: new Date().toISOString(),
        authenticationStatus: fixtureMode ? 'authenticated' : 'not-configured',
        message: fixtureMode
          ? 'Synthetic fixture mode is ready'
          : `Portal recording required: ${requiredPortalInformation.join('; ')}`,
        reauthenticationRequired: false,
        details: { mode: fixtureMode ? 'fixture' : 'skeleton' },
      });
    },
    async sync(context) {
      const startedAt = new Date();
      const fixtureMode = (context.config as { mode?: string }).mode === 'fixture';
      const finishedAt = new Date();
      if (!fixtureMode) {
        return connectorSyncResultSchema.parse({
          connectorId: metadata.id,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          success: false,
          recordsFound: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          errorType: 'configuration',
          errorMessage: `Connector skeleton needs a reviewed portal recording: ${requiredPortalInformation.join('; ')}`,
          reauthenticationRequired: false,
          retryCount: Math.max(0, context.attempt - 1),
          records: [],
          metadata: { mode: 'skeleton', requiredPortalInformation },
        });
      }
      return connectorSyncResultSchema.parse({
        connectorId: metadata.id,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        success: true,
        recordsFound: fixtureRecords.length,
        recordsCreated: fixtureRecords.length,
        recordsUpdated: 0,
        recordsSkipped: 0,
        reauthenticationRequired: false,
        retryCount: Math.max(0, context.attempt - 1),
        lastSuccessfulSyncAt: finishedAt.toISOString(),
        records: fixtureRecords,
        metadata: { mode: 'fixture' },
      });
    },
  };
}
