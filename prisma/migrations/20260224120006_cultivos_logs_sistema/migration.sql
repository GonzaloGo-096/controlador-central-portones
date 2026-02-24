-- Logs sistema: auditoría con contexto JSONB, PK UUID. Índice opcional por maceta_id y created_at.
CREATE TABLE IF NOT EXISTS "logs_sistema" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "nivel" TEXT NOT NULL,
  "mensaje" TEXT NOT NULL,
  "contexto" JSONB,
  "maceta_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_logs_sistema_maceta_id" ON "logs_sistema" ("maceta_id");
CREATE INDEX IF NOT EXISTS "idx_logs_sistema_created_at" ON "logs_sistema" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_logs_sistema_nivel" ON "logs_sistema" ("nivel");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_logs_sistema_maceta') THEN
    ALTER TABLE "logs_sistema"
      ADD CONSTRAINT "fk_logs_sistema_maceta"
      FOREIGN KEY ("maceta_id") REFERENCES "macetas"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
