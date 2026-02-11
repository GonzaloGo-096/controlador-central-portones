# Endpoint de diagnóstico de producción: GET /api/_prod_db_test

Endpoint **temporal** para verificar que el backend usa la base de datos correcta (Railway), que el pool conecta y que las queries reales funcionan. No depende de Telegram.

**Si funciona local y no en Railway:** ver **[POR-QUE-FUNCIONA-LOCAL-Y-NO-EN-RAILWAY.md](./POR-QUE-FUNCIONA-LOCAL-Y-NO-EN-RAILWAY.md)** (paso a paso en el panel de Railway).

---

## Ver el contenido real de la DB de Railway (tablas y columnas)

**GET /api/_prod_schema** — devuelve la estructura exacta de la base a la que está conectado el backend (en Railway, la base de Railway).

### Si ves 404 en /api/_prod_schema

Hacé **push** de los últimos cambios y **redeploy** en Railway. Después tenés **dos formas** de ver el schema:

1. **GET /api/_prod_db_test?schema=1** — mismo endpoint de test; con `?schema=1` devuelve tablas y columnas.
2. **GET /api/_prod_schema** — ruta dedicada (mismo contenido).

Ejemplo: `https://controlador-central-portones-production.up.railway.app/api/_prod_db_test?schema=1`

### Pasos exactos (después del deploy)

1. **Sacá la URL del backend:** Railway → tu proyecto → servicio del **backend** (Node) → pestaña **Settings** o **Variables** → copiá **RAILWAY_PUBLIC_DOMAIN** o la URL que te muestra (ej. `controlador-central-portones-production.up.railway.app`).
2. **En el navegador:** abrí esta URL (reemplazá `TU-DOMINIO` por lo que copiaste):
   ```
   https://TU-DOMINIO/api/_prod_schema
   ```
   Ejemplo: `https://controlador-central-portones-production.up.railway.app/api/_prod_schema`
3. **Desde la terminal** (misma carpeta del proyecto), con tu URL:
   ```powershell
   $env:BASE_URL="https://TU-DOMINIO"; node scripts/ver-schema-railway.js
   ```
   Reemplazá `TU-DOMINIO` por el mismo valor (ej. `controlador-central-portones-production.up.railway.app`).

- **Respuesta:** `ok`, `host`, `tables` (nombres) y `schema` (cada tabla con lista de columnas: nombre, tipo, nullable). Así podés comparar con tu base local y ver si falta algo antes de igualar con `schema-replace.sql`.

---

## Cómo llamar a _prod_db_test

- **Local:** `GET http://localhost:3030/api/_prod_db_test` (o el `PORT` que uses).
- **Railway / preview:** `GET https://TU-BACKEND-RAILWAY.up.railway.app/api/_prod_db_test`.

Reiniciar el backend después de añadir el endpoint si ya estaba corriendo.

---

## Respuesta de éxito (200)

```json
{
  "ok": true,
  "now": "2026-02-11T00:12:00.123Z",
  "tables": ["gates", "tenants", "users"],
  "counts": {
    "users": 3,
    "tenants": 2,
    "gates": 5
  }
}
```

- **now:** hora del servidor PostgreSQL (confirma que la conexión es a esa DB).
- **tables:** tablas en el schema `public` (deberían estar `users`, `tenants`, `gates` si corriste `scripts/schema.sql`).
- **counts:** cantidad de filas en cada tabla (0 si están vacías).

---

## Respuesta de error (500)

```json
{
  "ok": false,
  "step": "connection" | "list_tables" | "count_users" | "count_tenants" | "count_gates",
  "error": "mensaje del error"
}
```

- **step** indica en qué paso falló:
  - `connection`: falló `SELECT NOW()` (pool/conexión).
  - `list_tables`: falló la consulta a `information_schema`.
  - `count_users` / `count_tenants` / `count_gates`: falló el `COUNT` de esa tabla (ej. tabla no existe).

En consola del backend se loguea el error completo (stack incluido).

---

## Logs al entrar al endpoint

Al hacer la petición, en la consola del backend verás algo como:

```
[_prod_db_test] Inicio — host: postgres.railway.internal | port: 5432 | NODE_ENV: production
```

- Si **host** es `postgres.railway.internal` (o similar de Railway), el backend está usando la DB de Railway.
- Si **host** es `localhost`, está usando la DB local (variables `DB_*`).

---

## Cómo interpretar el resultado

| Situación | Interpretación |
|-----------|----------------|
| `ok: true`, `tables` con users/tenants/gates, `counts` con números | Backend conectado a la DB correcta; tablas y datos OK. |
| `ok: true`, `tables` vacías o sin users/tenants/gates | Conexión OK pero no se crearon las tablas; ejecutar `scripts/schema.sql` en esa DB. |
| `step: "connection"` | Pool no conecta (URL, red, SSL, credenciales). Revisar `DATABASE_URL` y logs. |
| `step: "count_users"` (o tenants/gates) | Tabla no existe o sin permiso; crear tablas con `schema.sql`. |

---

## Cómo eliminar el endpoint después del diagnóstico

1. En `src/index.js`: quitar la línea `const prodDbTestRouter = require("./api/prodDbTest");` y la línea `app.use("/api", prodDbTestRouter);`.
2. Borrar el archivo `src/api/prodDbTest.js`.
3. Opcional: borrar este doc `docs/PROD-DB-TEST.md`.
