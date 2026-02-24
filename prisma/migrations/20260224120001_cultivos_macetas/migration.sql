-- Macetas: una por cultivo, PK UUID, FK cultivos RESTRICT, índices por maceta (cultivo_id para listados).
CREATE TABLE IF NOT EXISTS "macetas" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cultivo_id" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "identificador" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_macetas_cultivo_id" ON "macetas" ("cultivo_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_macetas_cultivo') THEN
    ALTER TABLE "macetas"
      ADD CONSTRAINT "fk_macetas_cultivo"
      FOREIGN KEY ("cultivo_id") REFERENCES "cultivos"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
