# Usar una sola base de datos (Railway) desde local y desde el deploy

Así **no tenés dos bases**: solo la de Railway. Tu PC y el backend desplegado se conectan a la misma.

---

## 1. Crear las tablas una sola vez en Railway

En Railway → servicio **PostgreSQL** → **Query** (o conectarte con la URL pública). Ejecutá:

```sql
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT,
  telegram_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE tenants (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE gates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_tenants_user_id ON tenants(user_id);
CREATE INDEX idx_gates_tenant_id ON gates(tenant_id);
```

---

## 2. Conectar tu PC a esa misma base (opcional)

En tu **.env** local, comentá las variables `DB_HOST`, `DB_USER`, etc. y descomentá **una sola** variable:

**DATABASE_URL** = la **DATABASE_PUBLIC_URL** de Railway (la que tiene `caboose.proxy.rlwy.net` o similar).

Ejemplo (reemplazá con la URL real que te muestra Railway en el servicio Postgres):

```env
# Una sola base (Railway). Local y deploy usan la misma.
DATABASE_URL=postgresql://postgres:TU_PASSWORD@caboose.proxy.rlwy.net:11919/railway

# Dejá comentadas las de DB local:
# DB_HOST=localhost
# DB_USER=postgres
# ...
```

La **DATABASE_PUBLIC_URL** la copiás desde Railway → PostgreSQL → Variables / Connect.

---

## 3. Qué queda

| Dónde corre el backend | A qué base se conecta |
|------------------------|------------------------|
| En tu PC (`node src/index.js`) | Base **railway** en Railway (vía DATABASE_URL pública) |
| En Railway (deploy)            | Base **railway** en Railway (vía DATABASE_URL interna) |

Una sola base, misma estructura y mismos datos. No hace falta “recrear” nada en otro lado.

---

## 4. Si tenés datos en tu base local y querés pasarlos a Railway

Desde tu PC (con `portones_db` funcionando):

```bash
pg_dump -U postgres -h localhost -d portones_db --data-only -t users -t tenants -t gates > datos.sql
```

Luego conectás a la base de Railway con la URL pública y ejecutás o importás ese `datos.sql` (solo los INSERT). Si querés, en otro paso te detallo cómo.
