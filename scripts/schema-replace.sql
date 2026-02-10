-- =============================================================================
-- REEMPLAZAR tablas para que coincidan con schema.sql (estructura real)
-- =============================================================================
-- Borra y recrea: gate_events, user_gates, gates, user_tenants, tenants, users.
-- Usar cuando la base tiene otra estructura. SE PIERDEN LOS DATOS de estas tablas.
-- Después de ejecutar, opcional: insertar datos de prueba.
-- =============================================================================

DROP TABLE IF EXISTS gate_events;
DROP TABLE IF EXISTS user_gates;
DROP TABLE IF EXISTS gates;
DROP TABLE IF EXISTS user_tenants;
DROP TABLE IF EXISTS tenants;
DROP TABLE IF EXISTS users;

-- Mismo contenido que schema.sql

CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT NOT NULL,
  telegram_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tenants (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_tenants (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  role       TEXT NOT NULL
);

CREATE TABLE gates (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  location   TEXT,
  state      TEXT NOT NULL DEFAULT 'closed',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_gates (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gate_id    INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gate_events (
  id         SERIAL PRIMARY KEY,
  gate_id    INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_user_tenants_user_id ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX idx_gates_tenant_id ON gates(tenant_id);
CREATE INDEX idx_user_gates_user_id ON user_gates(user_id);
CREATE INDEX idx_user_gates_gate_id ON user_gates(gate_id);
CREATE INDEX idx_gate_events_gate_id ON gate_events(gate_id);
