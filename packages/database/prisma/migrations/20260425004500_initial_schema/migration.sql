-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'SALESPERSON');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SLEEPING', 'DISABLED', 'PASSWORD_RESET_REQUIRED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL', 'CRM_NOTE');

-- CreateEnum
CREATE TYPE "MessageTone" AS ENUM ('STANDARD_CLOSER', 'SOFT_CONSULTATIVE', 'AGGRESSIVE_APPOINTMENT_SETTER', 'MANAGER_TAKEOVER');

-- CreateTable
CREATE TABLE "Dealership" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyTokenLimit" INTEGER NOT NULL DEFAULT 250000,
    "monthlyTokenLimit" INTEGER NOT NULL DEFAULT 5000000,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "extensionMinVersion" TEXT NOT NULL DEFAULT '0.1.0',
    "extensionLatestVersion" TEXT NOT NULL DEFAULT '0.1.0',
    "supportEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "signatureName" TEXT,
    "signatureDealershipName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dailyRequestLimit" INTEGER,
    "monthlyRequestLimit" INTEGER,
    "dailyTokenLimit" INTEGER,
    "lastLoginAt" TIMESTAMP(3),
    "dealershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MessageChannel",
    "action" TEXT,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRule" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "tone" "MessageTone" NOT NULL,
    "action" TEXT NOT NULL,
    "leadContext" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "evaluator" JSONB NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealership_slug_key" ON "Dealership"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_dealershipId_role_idx" ON "User"("dealershipId", "role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "PromptTemplate_dealershipId_isActive_idx" ON "PromptTemplate"("dealershipId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_dealershipId_key_key" ON "PromptTemplate"("dealershipId", "key");

-- CreateIndex
CREATE INDEX "WorkflowRule_dealershipId_isActive_idx" ON "WorkflowRule"("dealershipId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRule_dealershipId_key_key" ON "WorkflowRule"("dealershipId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLog_requestId_key" ON "UsageLog"("requestId");

-- CreateIndex
CREATE INDEX "UsageLog_dealershipId_day_idx" ON "UsageLog"("dealershipId", "day");

-- CreateIndex
CREATE INDEX "UsageLog_userId_day_idx" ON "UsageLog"("userId", "day");

-- CreateIndex
CREATE INDEX "UsageLog_conversationId_idx" ON "UsageLog"("conversationId");

-- CreateIndex
CREATE INDEX "MessageLog_dealershipId_createdAt_idx" ON "MessageLog"("dealershipId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_userId_createdAt_idx" ON "MessageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_conversationId_idx" ON "MessageLog"("conversationId");

-- CreateIndex
CREATE INDEX "MessageLog_flagged_idx" ON "MessageLog"("flagged");

-- CreateIndex
CREATE INDEX "AuditLog_dealershipId_createdAt_idx" ON "AuditLog"("dealershipId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRule" ADD CONSTRAINT "WorkflowRule_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

