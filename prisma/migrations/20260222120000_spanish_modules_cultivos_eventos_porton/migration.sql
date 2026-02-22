-- Roles en español + tablas de auditoría y cultivos.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole_new" AS ENUM ('superadministrador', 'administrador_cuenta', 'operador');

    ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

    ALTER TABLE "users"
      ALTER COLUMN "role" TYPE "UserRole_new"
      USING (
        CASE
          WHEN "role"::text = 'ADMIN' THEN 'administrador_cuenta'
          WHEN "role"::text = 'OPERATOR' THEN 'operador'
          WHEN "role"::text = 'superadministrador' THEN 'superadministrador'
          WHEN "role"::text = 'administrador_cuenta' THEN 'administrador_cuenta'
          WHEN "role"::text = 'operador' THEN 'operador'
          ELSE 'operador'
        END
      )::"UserRole_new";

    DROP TYPE "UserRole";
    ALTER TYPE "UserRole_new" RENAME TO "UserRole";
    ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'administrador_cuenta'::"UserRole";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "eventos_porton" (
  "id" SERIAL PRIMARY KEY,
  "usuario_id" INTEGER NULL,
  "cuenta_id" INTEGER NOT NULL,
  "porton_id" INTEGER NOT NULL,
  "grupo_portones_id" INTEGER NOT NULL,
  "accion" TEXT NOT NULL,
  "canal" TEXT NOT NULL,
  "fecha_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_eventos_porton_cuenta_id" ON "eventos_porton" ("cuenta_id");
CREATE INDEX IF NOT EXISTS "idx_eventos_porton_porton_id" ON "eventos_porton" ("porton_id");
CREATE INDEX IF NOT EXISTS "idx_eventos_porton_grupo_portones_id" ON "eventos_porton" ("grupo_portones_id");
CREATE INDEX IF NOT EXISTS "idx_eventos_porton_fecha_hora" ON "eventos_porton" ("fecha_hora");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eventos_porton_usuario'
  ) THEN
    ALTER TABLE "eventos_porton"
      ADD CONSTRAINT "fk_eventos_porton_usuario"
      FOREIGN KEY ("usuario_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eventos_porton_cuenta'
  ) THEN
    ALTER TABLE "eventos_porton"
      ADD CONSTRAINT "fk_eventos_porton_cuenta"
      FOREIGN KEY ("cuenta_id") REFERENCES "accounts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eventos_porton_porton'
  ) THEN
    ALTER TABLE "eventos_porton"
      ADD CONSTRAINT "fk_eventos_porton_porton"
      FOREIGN KEY ("porton_id") REFERENCES "gates"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eventos_porton_grupo'
  ) THEN
    ALTER TABLE "eventos_porton"
      ADD CONSTRAINT "fk_eventos_porton_grupo"
      FOREIGN KEY ("grupo_portones_id") REFERENCES "porton_groups"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "cultivos" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3) NULL
);

CREATE INDEX IF NOT EXISTS "idx_cultivos_account_id" ON "cultivos" ("account_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cultivos_account'
  ) THEN
    ALTER TABLE "cultivos"
      ADD CONSTRAINT "fk_cultivos_account"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
