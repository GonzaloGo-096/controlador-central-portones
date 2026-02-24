-- Constraint único compuesto para evitar adaptaciones duplicadas por (riego_id, tipo).
-- En PostgreSQL, varias filas con riego_id NULL siguen permitidas (NULL no equivale a NULL en UNIQUE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_adaptaciones_riego_tipo'
  ) THEN
    ALTER TABLE "adaptaciones"
      ADD CONSTRAINT "uq_adaptaciones_riego_tipo"
      UNIQUE ("riego_id", "tipo");
  END IF;
END $$;
