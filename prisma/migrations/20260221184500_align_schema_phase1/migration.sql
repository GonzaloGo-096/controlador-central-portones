-- Align schema phase 1:
-- - tenants.description
-- - users.email (unique)
-- - gates.type (required)

ALTER TABLE "tenants"
ADD COLUMN "description" TEXT;

ALTER TABLE "users"
ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

ALTER TABLE "gates"
ADD COLUMN "type" TEXT;

UPDATE "gates"
SET "type" = 'vehicular'
WHERE "type" IS NULL;

ALTER TABLE "gates"
ALTER COLUMN "type" SET NOT NULL;
