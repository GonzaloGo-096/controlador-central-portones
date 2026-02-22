-- Refactor domain semantics:
-- tenants -> porton_groups
-- user_tenants -> user_porton_groups
-- tenant_id -> porton_group_id (gates, user_porton_groups)

ALTER TABLE "tenants" RENAME TO "porton_groups";
ALTER TABLE "user_tenants" RENAME TO "user_porton_groups";

ALTER TABLE "gates" RENAME COLUMN "tenant_id" TO "porton_group_id";
ALTER TABLE "user_porton_groups" RENAME COLUMN "tenant_id" TO "porton_group_id";

ALTER TABLE "porton_groups" RENAME CONSTRAINT "tenants_pkey" TO "porton_groups_pkey";
ALTER TABLE "porton_groups" RENAME CONSTRAINT "tenants_account_id_fkey" TO "porton_groups_account_id_fkey";

ALTER TABLE "gates" RENAME CONSTRAINT "gates_tenant_id_fkey" TO "gates_porton_group_id_fkey";

ALTER TABLE "user_porton_groups" RENAME CONSTRAINT "user_tenants_pkey" TO "user_porton_groups_pkey";
ALTER TABLE "user_porton_groups" RENAME CONSTRAINT "user_tenants_tenant_id_fkey" TO "user_porton_groups_porton_group_id_fkey";
ALTER TABLE "user_porton_groups" RENAME CONSTRAINT "user_tenants_user_id_fkey" TO "user_porton_groups_user_id_fkey";

ALTER INDEX "idx_tenants_account_id" RENAME TO "idx_porton_groups_account_id";
ALTER INDEX "idx_gates_tenant_id" RENAME TO "idx_gates_porton_group_id";
ALTER INDEX "idx_user_tenants_tenant_id" RENAME TO "idx_user_porton_groups_porton_group_id";
ALTER INDEX "uq_user_tenant" RENAME TO "uq_user_porton_group";
