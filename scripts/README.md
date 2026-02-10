# Scripts de base de datos

## Qué es el "schema"

El **schema** es la **estructura** de la base: qué tablas hay y qué columnas tiene cada una. En este proyecto eso está definido en **`schema.sql`** y está **alineado con la base que ya tenés**: `users`, `tenants`, `user_tenants` (N:N), `gates`, `user_gates`, `gate_events`.

- El **código del backend** usa esa estructura (por ejemplo `user.repository.js` usa `user_tenants` para saber qué tenants tiene cada usuario).
- Para que todo funcione igual en tu PC y en Railway, **las dos bases tienen que tener la misma estructura** = la definida en `schema.sql`.

**Ver la estructura actual de tu base:** `node scripts/dump-schema.js` (muestra tablas y columnas de la base configurada en .env).

---

## schema.sql — crear tablas (sin borrar nada)

Usalo cuando la base **no tiene** las tablas, o cuando querés asegurarte de que existan sin tocar datos. Usa `CREATE TABLE IF NOT EXISTS`, así que no pisa tablas que ya existan (pero **tampoco cambia** columnas si ya creaste la tabla con otra estructura).

### En tu PC (base local)

```bash
psql -U postgres -d portones_db -f scripts/schema.sql
```

(O abrís `schema.sql` en pgAdmin y lo ejecutás contra tu base.)

### En Railway

1. Railway → servicio **PostgreSQL** → **Query**.
2. Copiá todo el contenido de `scripts/schema.sql`.
3. Pegalo y ejecutalo.

---

## schema-replace.sql — igualar la base al schema (borra y recrea)

Usalo cuando la base **ya tiene** tablas `users`, `tenants`, `gates` pero con **otra estructura** (por ejemplo `tenants` sin la columna `user_id`). Eso pasa si en algún momento se crearon con otro SQL o una versión vieja.

- **Qué hace:** borra las tablas `gates`, `tenants`, `users` y las vuelve a crear como en `schema.sql`.
- **Cuidado:** se pierden los datos de esas tres tablas en esa base.

### Cuándo usarlo

- En **Railway**, si al probar el backend te sale `column t.user_id does not exist` (u otro error de columna faltante): ejecutá `schema-replace.sql` en la Query de Railway. Después podés insertar datos de prueba (usuarios, tenants, gates) de nuevo.

### Cómo

1. Railway → servicio **PostgreSQL** → **Query**.
2. Copiá todo el contenido de `scripts/schema-replace.sql`.
3. Pegalo y ejecutalo.
4. (Opcional) Insertar datos de prueba, por ejemplo:

```sql
INSERT INTO users (full_name, telegram_id) VALUES ('Yo', 'TU_TELEGRAM_ID');
INSERT INTO tenants (name, user_id) VALUES ('Mi edificio', 1);
INSERT INTO gates (name, tenant_id) VALUES ('Portón principal', 1);
```

---

## Resumen

| Archivo            | Cuándo usarlo |
|--------------------|----------------|
| **schema.sql**     | Base nueva o para asegurar que existan las tablas sin borrar datos. |
| **schema-replace.sql** | Base que ya tiene esas tablas pero con estructura distinta (ej. Railway con error "user_id does not exist"). Borra y recrea. |
