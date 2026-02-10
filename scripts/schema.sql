-- =============================================================================
-- SCHEMA: definición de tablas (igual a la base que ya tenés)
-- =============================================================================
--
-- Estructura real: users, tenants, user_tenants (N:N), gates, user_gates, gate_events.
-- El backend usa user_tenants para saber qué tenants tiene cada usuario (no hay user_id en tenants).
--
-- Uso: ejecutá este archivo en una base nueva. Si la base ya tiene otra estructura,
-- usá schema-replace.sql (borra y recrea).
--
-- Local:  psql -U postgres -d portones_db -f scripts/schema.sql
-- Railway: Query en PostgreSQL → pegar y ejecutar.

-- Usuarios (telegram_id para vincular con el bot)
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT NOT NULL,
  telegram_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tenants (edificios). La relación con usuarios es por user_tenants.
CREATE TABLE IF NOT EXISTS tenants (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Qué usuarios pertenecen a qué tenants (N:N)
CREATE TABLE IF NOT EXISTS user_tenants (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  role       TEXT NOT NULL
);

-- Portones por tenant
CREATE TABLE IF NOT EXISTS gates (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  location   TEXT,
  state      TEXT NOT NULL DEFAULT 'closed',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Permisos usuario–portón (qué usuario puede usar qué portón)
CREATE TABLE IF NOT EXISTS user_gates (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gate_id    INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Log de eventos por portón
CREATE TABLE IF NOT EXISTS gate_events (
  id         SERIAL PRIMARY KEY,
  gate_id    INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gates_tenant_id ON gates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_gates_user_id ON user_gates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_gates_gate_id ON user_gates(gate_id);
CREATE INDEX IF NOT EXISTS idx_gate_events_gate_id ON gate_events(gate_id);
