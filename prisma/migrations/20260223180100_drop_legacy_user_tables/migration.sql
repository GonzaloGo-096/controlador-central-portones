-- Run AFTER migrate_to_identity_membership.js
-- Drops legacy User, UserCredential, UserPortonGroup, UserGate
-- Updates gate_events and eventos_porton to use identity_id only

-- Drop FK from gate_events.user_id and eventos_porton.usuario_id
ALTER TABLE "gate_events" DROP CONSTRAINT IF EXISTS "gate_events_user_id_fkey";
ALTER TABLE "eventos_porton" DROP CONSTRAINT IF EXISTS "fk_eventos_porton_usuario";

-- Drop legacy columns
ALTER TABLE "gate_events" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "eventos_porton" DROP COLUMN IF EXISTS "usuario_id";

-- Add FK for identity_id in gate_events
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_identity_id_fkey" 
  FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add FK for identity_id in eventos_porton
ALTER TABLE "eventos_porton" ADD CONSTRAINT "eventos_porton_identity_id_fkey" 
  FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index on eventos_porton.identity_id if not exists
CREATE INDEX IF NOT EXISTS "idx_eventos_porton_identity_id" ON "eventos_porton"("identity_id");

-- Drop legacy tables (order matters for FK)
DROP TABLE IF EXISTS "user_gates";
DROP TABLE IF EXISTS "user_porton_groups";
DROP TABLE IF EXISTS "user_credentials";
DROP TABLE IF EXISTS "users";
