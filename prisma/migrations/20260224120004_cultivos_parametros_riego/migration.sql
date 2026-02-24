-- Parámetros riego: versionado por maceta, PK UUID, FK macetas RESTRICT, índice por maceta_id.
CREATE TABLE IF NOT EXISTS "parametros_riego" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "maceta_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "humedad_objetivo_min" DOUBLE PRECISION,
  "humedad_objetivo_max" DOUBLE PRECISION,
  "volumen_ml_base" INTEGER,
  "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vigente_hasta" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_parametros_riego_maceta_id" ON "parametros_riego" ("maceta_id");
CREATE INDEX IF NOT EXISTS "idx_parametros_riego_vigente" ON "parametros_riego" ("maceta_id", "vigente_desde");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parametros_riego_maceta') THEN
    ALTER TABLE "parametros_riego"
      ADD CONSTRAINT "fk_parametros_riego_maceta"
      FOREIGN KEY ("maceta_id") REFERENCES "macetas"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
