-- CreateEnum
CREATE TYPE "ConnectorExecutionLocation" AS ENUM ('RAILWAY', 'LOCAL_AGENT', 'EXTENSION');

-- CreateEnum
CREATE TYPE "ConnectorAuthenticationStatus" AS ENUM ('NOT_CONFIGURED', 'AUTHENTICATED', 'REAUTHENTICATION_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectorRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('PENDING', 'APPROVAL_REQUIRED', 'APPROVED', 'LEASED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketplacePlatform" AS ENUM ('FACEBOOK', 'CRAIGSLIST', 'OFFERUP');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'APPROVAL_REQUIRED', 'QUEUED', 'POSTING', 'LIVE', 'FAILED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastHeartbeat" JSONB,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "encryptedConfigFormat" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "vin" VARCHAR(17) NOT NULL,
    "stockNumber" TEXT,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "trim" TEXT,
    "mileage" INTEGER,
    "retailPrice" DECIMAL(12,2),
    "cost" DECIMAL(12,2),
    "daysInStock" INTEGER,
    "websiteUrl" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "salesTalkingPoints" JSONB NOT NULL DEFAULT '[]',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSourceSnapshot" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "payload" JSONB NOT NULL,
    "checksum" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStatus" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "frontlineReady" BOOLEAN,
    "listed" BOOLEAN,
    "price" DECIMAL(12,2),
    "sourceUrl" TEXT,
    "synchronizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "InventoryStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "assignedSalesperson" TEXT,
    "aiSummary" TEXT,
    "objections" JSONB NOT NULL DEFAULT '[]',
    "tradeInformation" JSONB NOT NULL DEFAULT '{}',
    "leadPriority" INTEGER,
    "nextRecommendedAction" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "priority" INTEGER,
    "context" JSONB NOT NULL DEFAULT '{}',
    "draftResponse" TEXT,
    "responseApprovalStatus" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "externalId" TEXT,
    "channel" TEXT NOT NULL,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sender" TEXT,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "stage" TEXT,
    "openWork" JSONB NOT NULL DEFAULT '[]',
    "targetAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "location" TEXT,
    "holder" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarfaxSummary" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "owners" INTEGER,
    "accidents" INTEGER,
    "service" TEXT,
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "reportUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarfaxSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowSticker" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "storageKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WindowSticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appraisal" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "condition" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "appraisedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "platform" "MarketplacePlatform" NOT NULL,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
    "externalId" TEXT,
    "externalUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePostingAttempt" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "connectorRunId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "success" BOOLEAN,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "screenshotPath" TEXT,
    "htmlSnapshotPath" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MarketplacePostingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lender" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LenderProgram" (
    "id" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LenderProgramVersion" (
    "id" TEXT NOT NULL,
    "lenderProgramId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "importDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DECIMAL(5,4),
    "lastVerifiedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "LenderProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LenderRule" (
    "id" TEXT NOT NULL,
    "lenderProgramVersionId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sourceReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LenderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStructure" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "customerRef" TEXT,
    "salePrice" DECIMAL(12,2),
    "downPayment" DECIMAL(12,2),
    "tradeAllowance" DECIMAL(12,2),
    "termMonths" INTEGER,
    "apr" DECIMAL(7,4),
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecommendation" (
    "id" TEXT NOT NULL,
    "dealStructureId" TEXT NOT NULL,
    "lenderProgramVersionId" TEXT NOT NULL,
    "score" DECIMAL(7,4),
    "eligible" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "executionLocation" "ConnectorExecutionLocation" NOT NULL,
    "authenticationStatus" "ConnectorAuthenticationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "lastAttemptedAt" TIMESTAMP(3),
    "lastSuccessfulAt" TIMESTAMP(3),
    "lastDurationMs" INTEGER,
    "lastRecordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "currentError" TEXT,
    "reauthenticationRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorRun" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" "ConnectorRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "recordsFound" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "screenshotPath" TEXT,
    "htmlSnapshotPath" TEXT,
    "reauthenticationRequired" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ConnectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorError" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "connectorRunId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "screenshotPath" TEXT,
    "htmlSnapshotPath" TEXT,
    "reauthenticationRequired" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "deviceId" TEXT,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'PENDING',
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL,
    "approvalReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "leaseTokenHash" TEXT,
    "leasedUntil" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "result" JSONB,
    "error" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "leadId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "promptVersion" TEXT,
    "inputSummary" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL,
    "evaluation" JSONB NOT NULL DEFAULT '{}',
    "approved" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Device_lastHeartbeatAt_idx" ON "Device"("lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "Vehicle_stockNumber_idx" ON "Vehicle"("stockNumber");

-- CreateIndex
CREATE INDEX "Vehicle_make_model_year_idx" ON "Vehicle"("make", "model", "year");

-- CreateIndex
CREATE INDEX "VehicleSourceSnapshot_vehicleId_connectorId_observedAt_idx" ON "VehicleSourceSnapshot"("vehicleId", "connectorId", "observedAt");

-- CreateIndex
CREATE INDEX "VehicleSourceSnapshot_connectorId_sourceKey_idx" ON "VehicleSourceSnapshot"("connectorId", "sourceKey");

-- CreateIndex
CREATE INDEX "InventoryStatus_connectorId_synchronizedAt_idx" ON "InventoryStatus"("connectorId", "synchronizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStatus_vehicleId_connectorId_key" ON "InventoryStatus"("vehicleId", "connectorId");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_lastContactAt_idx" ON "Customer"("lastContactAt");

-- CreateIndex
CREATE INDEX "Lead_customerId_status_idx" ON "Lead"("customerId", "status");

-- CreateIndex
CREATE INDEX "Lead_vehicleId_idx" ON "Lead"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_source_externalId_key" ON "Lead"("source", "externalId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_updatedAt_idx" ON "Conversation"("customerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Message_conversationId_sentAt_idx" ON "Message"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "Appointment_customerId_startsAt_idx" ON "Appointment"("customerId", "startsAt");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_customerId_idx" ON "Task"("customerId");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "ReconRecord_vehicleId_observedAt_idx" ON "ReconRecord"("vehicleId", "observedAt");

-- CreateIndex
CREATE INDEX "KeyRecord_vehicleId_observedAt_idx" ON "KeyRecord"("vehicleId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarfaxSummary_vehicleId_key" ON "CarfaxSummary"("vehicleId");

-- CreateIndex
CREATE INDEX "WindowSticker_vehicleId_observedAt_idx" ON "WindowSticker"("vehicleId", "observedAt");

-- CreateIndex
CREATE INDEX "Appraisal_vehicleId_appraisedAt_idx" ON "Appraisal"("vehicleId", "appraisedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_platform_status_idx" ON "MarketplaceListing"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_vehicleId_platform_key" ON "MarketplaceListing"("vehicleId", "platform");

-- CreateIndex
CREATE INDEX "MarketplacePostingAttempt_listingId_startedAt_idx" ON "MarketplacePostingAttempt"("listingId", "startedAt");

-- CreateIndex
CREATE INDEX "MarketplacePostingAttempt_connectorRunId_idx" ON "MarketplacePostingAttempt"("connectorRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Lender_code_key" ON "Lender"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LenderProgram_lenderId_name_key" ON "LenderProgram"("lenderId", "name");

-- CreateIndex
CREATE INDEX "LenderProgramVersion_reviewStatus_effectiveDate_idx" ON "LenderProgramVersion"("reviewStatus", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "LenderProgramVersion_lenderProgramId_version_key" ON "LenderProgramVersion"("lenderProgramId", "version");

-- CreateIndex
CREATE INDEX "LenderRule_lenderProgramVersionId_ruleType_idx" ON "LenderRule"("lenderProgramVersionId", "ruleType");

-- CreateIndex
CREATE INDEX "ApprovalRecommendation_dealStructureId_score_idx" ON "ApprovalRecommendation"("dealStructureId", "score");

-- CreateIndex
CREATE INDEX "ApprovalRecommendation_lenderProgramVersionId_idx" ON "ApprovalRecommendation"("lenderProgramVersionId");

-- CreateIndex
CREATE INDEX "ConnectorRun_connectorId_startedAt_idx" ON "ConnectorRun"("connectorId", "startedAt");

-- CreateIndex
CREATE INDEX "ConnectorRun_status_startedAt_idx" ON "ConnectorRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ConnectorError_connectorId_createdAt_idx" ON "ConnectorError"("connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "ConnectorError_connectorRunId_idx" ON "ConnectorError"("connectorRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_idempotencyKey_key" ON "AutomationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationJob_status_scheduledAt_idx" ON "AutomationJob"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AutomationJob_deviceId_status_idx" ON "AutomationJob"("deviceId", "status");

-- CreateIndex
CREATE INDEX "AiGeneration_leadId_createdAt_idx" ON "AiGeneration"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_conversationId_createdAt_idx" ON "AiGeneration"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "VehicleSourceSnapshot" ADD CONSTRAINT "VehicleSourceSnapshot_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStatus" ADD CONSTRAINT "InventoryStatus_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRecord" ADD CONSTRAINT "ReconRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyRecord" ADD CONSTRAINT "KeyRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarfaxSummary" ADD CONSTRAINT "CarfaxSummary_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowSticker" ADD CONSTRAINT "WindowSticker_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePostingAttempt" ADD CONSTRAINT "MarketplacePostingAttempt_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderProgram" ADD CONSTRAINT "LenderProgram_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderProgramVersion" ADD CONSTRAINT "LenderProgramVersion_lenderProgramId_fkey" FOREIGN KEY ("lenderProgramId") REFERENCES "LenderProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderRule" ADD CONSTRAINT "LenderRule_lenderProgramVersionId_fkey" FOREIGN KEY ("lenderProgramVersionId") REFERENCES "LenderProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStructure" ADD CONSTRAINT "DealStructure_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecommendation" ADD CONSTRAINT "ApprovalRecommendation_dealStructureId_fkey" FOREIGN KEY ("dealStructureId") REFERENCES "DealStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorRun" ADD CONSTRAINT "ConnectorRun_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorError" ADD CONSTRAINT "ConnectorError_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorError" ADD CONSTRAINT "ConnectorError_connectorRunId_fkey" FOREIGN KEY ("connectorRunId") REFERENCES "ConnectorRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
