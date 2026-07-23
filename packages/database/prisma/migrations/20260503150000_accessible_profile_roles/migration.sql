ALTER TABLE "User"
ADD COLUMN "accessibleProfileRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "User"
SET "accessibleProfileRoles" = CASE
  WHEN "role" = 'OWNER' THEN ARRAY['salesperson', 'bdc', 'manager']::TEXT[]
  WHEN "role" = 'MANAGER' THEN ARRAY['manager']::TEXT[]
  WHEN "role" = 'BDC' THEN ARRAY['bdc']::TEXT[]
  ELSE ARRAY['salesperson']::TEXT[]
END
WHERE "accessibleProfileRoles" IS NULL
   OR array_length("accessibleProfileRoles", 1) IS NULL;

ALTER TABLE "User"
ALTER COLUMN "accessibleProfileRoles" SET NOT NULL;
