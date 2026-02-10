-- Esquema de la base de datos (usuarios, tenants, gates).
-- Es la ÚNICA definición: ejecutá este mismo archivo en local y en Railway
-- para que ambas bases tengan la misma estructura.
--
-- Uso local:  psql -U postgres -d portones_db -f scripts/schema.sql
-- Railway:    copiá y pegá este contenido en Query, o conectá con psql y ejecutá el archivo.

-- Usuarios (identificados por telegram_id)
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT,
  telegram_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenants (cada usuario puede tener varios)
CREATE TABLE IF NOT EXISTS tenants (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Gates (cada tenant puede tener varios portones)
CREATE TABLE IF NOT EXISTS gates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_gates_tenant_id ON gates(tenant_id);
