ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BDC';

ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "hometown" TEXT,
ADD COLUMN "movedHereReason" TEXT,
ADD COLUMN "yearsSellingCars" INTEGER,
ADD COLUMN "previousCareer" TEXT,
ADD COLUMN "militaryService" TEXT,
ADD COLUMN "favoriteLocalSpot" TEXT,
ADD COLUMN "personalWhy" TEXT,
ADD COLUMN "customerBio" TEXT,
ADD COLUMN "bioCompletedAt" TIMESTAMP(3);

UPDATE "User"
SET
  "dailyRequestLimit" = NULL,
  "monthlyRequestLimit" = NULL,
  "dailyTokenLimit" = NULL,
  "bonusDailyRequestLimit" = 0;

UPDATE "User"
SET
  "firstName" = split_part("name", ' ', 1),
  "lastName" = NULLIF(trim(substr("name", length(split_part("name", ' ', 1)) + 1)), ''),
  "displayName" = COALESCE("signatureName", "name")
WHERE "firstName" IS NULL;
