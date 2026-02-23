-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MembershipRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'OPERATOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" SERIAL NOT NULL,
    "identity_id" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "secret_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_credentials_type_identifier" ON "credentials"("type", "identifier");
CREATE INDEX "idx_credentials_identity_id" ON "credentials"("identity_id");

-- CreateTable
CREATE TABLE "account_memberships" (
    "id" SERIAL NOT NULL,
    "identity_id" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OPERATOR',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_account_membership_identity_account" ON "account_memberships"("identity_id", "account_id");
CREATE INDEX "idx_account_memberships_account_id" ON "account_memberships"("account_id");
CREATE INDEX "idx_account_memberships_identity_id" ON "account_memberships"("identity_id");

-- CreateTable
CREATE TABLE "membership_porton_groups" (
    "id" SERIAL NOT NULL,
    "membership_id" INTEGER NOT NULL,
    "porton_group_id" INTEGER NOT NULL,
    "role_in_group" "TenantRole" DEFAULT 'operator',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_porton_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_membership_porton_group" ON "membership_porton_groups"("membership_id", "porton_group_id");
CREATE INDEX "idx_membership_porton_groups_porton_group_id" ON "membership_porton_groups"("porton_group_id");

-- CreateTable
CREATE TABLE "membership_gate_permissions" (
    "id" SERIAL NOT NULL,
    "membership_id" INTEGER NOT NULL,
    "gate_id" INTEGER NOT NULL,
    "permission" "GatePermission" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_gate_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_membership_gate_permission" ON "membership_gate_permissions"("membership_id", "gate_id");
CREATE INDEX "idx_membership_gate_permissions_gate_id" ON "membership_gate_permissions"("gate_id");

-- Add identity_id to gate_events (keep user_id for now, migration script will populate)
ALTER TABLE "gate_events" ADD COLUMN IF NOT EXISTS "identity_id" TEXT;

-- Add identity_id to eventos_porton (keep usuario_id for now)
ALTER TABLE "eventos_porton" ADD COLUMN IF NOT EXISTS "identity_id" TEXT;

-- AddForeignKey (credentials)
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (account_memberships)
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (membership_porton_groups)
ALTER TABLE "membership_porton_groups" ADD CONSTRAINT "membership_porton_groups_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "account_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_porton_groups" ADD CONSTRAINT "membership_porton_groups_porton_group_id_fkey" FOREIGN KEY ("porton_group_id") REFERENCES "porton_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (membership_gate_permissions)
ALTER TABLE "membership_gate_permissions" ADD CONSTRAINT "membership_gate_permissions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "account_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_gate_permissions" ADD CONSTRAINT "membership_gate_permissions_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "gates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex for gate_events and eventos_porton identity_id (FK added in drop-legacy migration)
CREATE INDEX IF NOT EXISTS "idx_gate_events_identity_id" ON "gate_events"("identity_id");
