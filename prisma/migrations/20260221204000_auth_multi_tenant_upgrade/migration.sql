-- Auth architecture upgrade:
-- - Identity/auth separation via user_credentials
-- - Role + permissions_version on users
-- - Backfill credentials from legacy users columns
-- - Safe cleanup of old auth columns

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CredentialType') THEN
    CREATE TYPE "CredentialType" AS ENUM ('PASSWORD', 'TELEGRAM');
  END IF;
END
$$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'ADMIN';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissions_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_permissions_version" ON "users" ("permissions_version");

CREATE TABLE IF NOT EXISTS "user_credentials" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "CredentialType" NOT NULL,
  "identifier" TEXT NOT NULL,
  "secret_hash" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_credentials_type_identifier"
ON "user_credentials" ("type", "identifier");

CREATE INDEX IF NOT EXISTS "idx_user_credentials_user_id"
ON "user_credentials" ("user_id");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'username'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_hash'
  ) THEN
    INSERT INTO "user_credentials" ("user_id", "type", "identifier", "secret_hash", "is_active")
    SELECT u.id, 'PASSWORD', u.username, u.password_hash, true
    FROM "users" u
    WHERE u.username IS NOT NULL
      AND u.password_hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "user_credentials" uc
        WHERE uc."type" = 'PASSWORD'
          AND uc."identifier" = u.username
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'telegram_id'
  ) THEN
    INSERT INTO "user_credentials" ("user_id", "type", "identifier", "secret_hash", "is_active")
    SELECT u.id, 'TELEGRAM', u.telegram_id::text, NULL, true
    FROM "users" u
    WHERE u.telegram_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "user_credentials" uc
        WHERE uc."type" = 'TELEGRAM'
          AND uc."identifier" = u.telegram_id::text
      );
  END IF;
END
$$;

ALTER TABLE "users" DROP COLUMN IF EXISTS "username";
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
ALTER TABLE "users" DROP COLUMN IF EXISTS "telegram_id";
DROP INDEX IF EXISTS "idx_users_telegram_id";
DROP INDEX IF EXISTS "users_telegram_id_key";
