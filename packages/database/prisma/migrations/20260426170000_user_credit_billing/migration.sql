CREATE TYPE "CreditLedgerType" AS ENUM (
  'FREE_GRANT',
  'RECHARGE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'USAGE_DEBIT',
  'ADJUSTMENT'
);

ALTER TABLE "User"
ADD COLUMN "creditBalanceMicros" INTEGER NOT NULL DEFAULT 1000000,
ADD COLUMN "freeCreditGrantedMicros" INTEGER NOT NULL DEFAULT 1000000,
ADD COLUMN "lifetimeCreditMicros" INTEGER NOT NULL DEFAULT 1000000;

CREATE TABLE "CreditLedger" (
  "id" TEXT NOT NULL,
  "dealershipId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "CreditLedgerType" NOT NULL,
  "amountMicros" INTEGER NOT NULL,
  "costMicros" INTEGER NOT NULL DEFAULT 0,
  "profitMicros" INTEGER NOT NULL DEFAULT 0,
  "markupBps" INTEGER,
  "requestId" TEXT,
  "note" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditLedger_dealershipId_createdAt_idx" ON "CreditLedger"("dealershipId", "createdAt");
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");
CREATE INDEX "CreditLedger_actorUserId_createdAt_idx" ON "CreditLedger"("actorUserId", "createdAt");
CREATE INDEX "CreditLedger_requestId_idx" ON "CreditLedger"("requestId");

ALTER TABLE "CreditLedger"
ADD CONSTRAINT "CreditLedger_dealershipId_fkey"
FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedger"
ADD CONSTRAINT "CreditLedger_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedger"
ADD CONSTRAINT "CreditLedger_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CreditLedger" (
  "id",
  "dealershipId",
  "userId",
  "type",
  "amountMicros",
  "costMicros",
  "profitMicros",
  "markupBps",
  "note",
  "metadata"
)
SELECT
  concat('free_', "id"),
  "dealershipId",
  "id",
  'FREE_GRANT',
  1000000,
  0,
  1000000,
  CASE
    WHEN "role" = 'MANAGER' THEN 45000
    WHEN "role" = 'OWNER' THEN 0
    ELSE 35000
  END,
  'Initial $1 selling-price credit grant',
  jsonb_build_object('source', 'migration')
FROM "User"
WHERE "role" <> 'OWNER';

UPDATE "User"
SET
  "creditBalanceMicros" = 0,
  "freeCreditGrantedMicros" = 0,
  "lifetimeCreditMicros" = 0
WHERE "role" = 'OWNER';
