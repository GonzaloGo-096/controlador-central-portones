-- Migración correctiva módulo cultivos. No borra datos existentes.

-- ─── 1) sensores_lecturas: columnas explícitas + extras JSONB + índice compuesto ───
ALTER TABLE "sensores_lecturas"
  ADD COLUMN IF NOT EXISTS "humedad" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "temperatura" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ec" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "extras" JSONB;

ALTER TABLE "sensores_lecturas" DROP COLUMN IF EXISTS "tipo_sensor";
ALTER TABLE "sensores_lecturas" DROP COLUMN IF EXISTS "valor";
ALTER TABLE "sensores_lecturas" DROP COLUMN IF EXISTS "unidad";

CREATE INDEX IF NOT EXISTS "idx_sensores_lecturas_maceta_created_at_desc"
  ON "sensores_lecturas" ("maceta_id", "created_at" DESC);

-- ─── 2) parametros_riego: un solo registro vigente por maceta ───
CREATE UNIQUE INDEX IF NOT EXISTS "uq_parametros_riego_vigente_por_maceta"
  ON "parametros_riego" ("maceta_id")
  WHERE "vigente_hasta" IS NULL;

-- ─── 3) logs_sistema: modulo, evento, user_id, cultivo_id, ciclo_id ───
ALTER TABLE "logs_sistema"
  ADD COLUMN IF NOT EXISTS "modulo" TEXT,
  ADD COLUMN IF NOT EXISTS "evento" TEXT,
  ADD COLUMN IF NOT EXISTS "user_id" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "cultivo_id" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "ciclo_id" UUID NULL;

-- ─── 4) Índices logs_sistema ───
CREATE INDEX IF NOT EXISTS "idx_logs_sistema_modulo" ON "logs_sistema" ("modulo");
CREATE INDEX IF NOT EXISTS "idx_logs_sistema_evento" ON "logs_sistema" ("evento");
CREATE INDEX IF NOT EXISTS "idx_logs_sistema_user_id" ON "logs_sistema" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_logs_sistema_cultivo_id" ON "logs_sistema" ("cultivo_id");
