# Flujo completo: Bot → Backend → Base de datos → Respuesta al bot (producción)

Este documento describe todo el contacto con la base de datos desde que el bot envía una petición hasta que recibe la respuesta.

---

## Vista general

```
[ Usuario en Telegram ]
         │
         ▼
[ Bot de Telegram ]  ←── otro proyecto, llama por HTTP al backend
         │
         │  HTTP (GET o POST)
         ▼
[ Backend en Railway ]  ←── este repo (controlador-central-portones)
         │
         ├── Controller (valida request)
         ├── Service (lógica de negocio)
         ├── Repository (SQL)
         ▼
[ PostgreSQL en Railway ]
         │
         │  filas (rows)
         ▼
[ Repository ] → [ Service ] → [ Controller ] → JSON
         │
         │  HTTP response
         ▼
[ Bot de Telegram ]  ←── recibe JSON y muestra menús/mensajes al usuario
```

---

## Flujo 1: Usuario toca Start (listar tenants y gates)

Cuando el usuario escribe /start (o el bot necesita mostrar edificios/portones), el **bot** llama al backend para obtener la lista de tenants y gates de ese usuario.

### 1. Bot → Backend

- **Método y URL:** `GET https://TU-BACKEND-RAILWAY/api/telegram/tenants?telegram_id=123456789`
- **Query:** `telegram_id` = id del usuario en Telegram (el bot lo obtiene de `ctx.from.id` o similar).
- El bot no envía body; solo la URL con el query.

### 2. Backend recibe (Controller)

- **Archivo:** `src/api/telegram.controller.js`
- **Ruta:** `GET /telegram/tenants` (montada en `/api`, entonces full path = `/api/telegram/tenants`).
- **Qué hace:**
  - Lee `req.query.telegram_id`.
  - Si falta o está vacío → responde **400** `{ error: "telegram_id is required" }`.
  - Si `USE_FAKE_TENANTS=true` → responde **200** con `{ tenants: FAKE_TENANTS }` **sin tocar la DB**.
  - Si no, llama al servicio: `getTenantsWithGates(telegramId)`.

### 3. Service (lógica de negocio)

- **Archivo:** `src/services/telegram.service.js`
- **Función:** `getTenantsWithGates(telegramId)`.
- **Qué hace:**
  - Llama al repositorio: `getTenantsAndGatesByTelegramId(telegramId)`.
  - Recibe filas crudas de la DB.
  - Agrupa por tenant y arma: `[{ tenantId, tenantName, gates: [{ gateId, gateName }] }]`.
  - Si no hay filas, devuelve `[]`.
  - No toca HTTP ni SQL; solo transforma datos.

### 4. Repository (acceso a la base de datos)

- **Archivo:** `src/repositories/user.repository.js`
- **Función:** `getTenantsAndGatesByTelegramId(telegramId)`.
- **Qué hace:**
  - Usa el **pool** de `src/db/pool.js` (conexión a PostgreSQL).
  - Ejecuta **una sola query** con parámetro `$1 = telegramId`:

```sql
SELECT
  t.id   AS tenant_id,
  t.name AS tenant_name,
  g.id   AS gate_id,
  g.name AS gate_name
FROM users u
JOIN tenants t ON t.user_id = u.id
LEFT JOIN gates g ON g.tenant_id = t.id
WHERE u.telegram_id = $1
ORDER BY t.id, g.id
```

  - Devuelve `result.rows` (array de filas). Si el usuario no existe o no tiene tenants, devuelve `[]`.

### 5. Conexión a la DB (producción)

- **Archivo:** `src/db/pool.js`
- **En producción (Railway):**
  - Lee `process.env.DATABASE_URL` (la tenés que definir en **Variables** del **servicio del backend** en Railway).
  - Crea un `Pool` de `pg` con esa URL y `ssl: { rejectUnauthorized: false }` (porque la URL no es localhost).
  - Ese pool es el que usa el repository para todas las queries.
- Si `DATABASE_URL` no está definida en Railway, el backend usa `DB_HOST`, `DB_NAME`, etc.; en el servidor suelen estar vacíos y el cliente conecta a `localhost:5432` → **ECONNREFUSED ::1:5432**.

### 6. Respuesta hacia el bot

- **Controller** recibe el array de tenants del service.
- Responde **200** con: `{ tenants: [ { tenantId, tenantName, gates: [ { gateId, gateName } ] }, ... ] }`.
- Si hubo excepción (ej. error de conexión a la DB), responde **500** `{ error: "Internal server error" }` y en los logs del backend aparece la causa (ej. ECONNREFUSED).

### 7. Bot recibe el JSON

- El bot hace la petición HTTP y recibe ese JSON.
- Con eso arma los menús (por ejemplo: lista de tenants, y al elegir uno, lista de gates).
- Si `tenants` es `[]`, el bot puede mostrar “No tenés edificios asignados” o similar.

---

## Flujo 2: Usuario elige un portón y una acción (OPEN / CLOSE / STOP)

Cuando el usuario elige un gate y una acción, el **bot** llama al backend para ejecutar el comando (y el backend valida permisos y dispara la FSM/MQTT).

### 1. Bot → Backend

- **Método y URL:** `POST https://TU-BACKEND-RAILWAY/api/telegram/command`
- **Body (JSON):** `{ telegramId, gateId, action }`
  - `telegramId`: id del usuario en Telegram.
  - `gateId`: id del gate que eligió (número o string).
  - `action`: `"OPEN"` | `"CLOSE"` | `"STOP"`.

### 2. Backend recibe (Controller)

- **Archivo:** `src/api/telegram.command.controller.js`
- **Ruta:** `POST /telegram/command` → full path = `/api/telegram/command`.
- **Qué hace:**
  - Valida que el body sea un objeto y que existan `telegramId`, `gateId`, `action` con tipos correctos.
  - Si algo falla → **400** con mensaje concreto.
  - Llama al servicio: `executeTelegramCommand({ telegramId, gateId, action }, { getStateMachine, onStateChange })`.

### 3. Service (autorización + FSM)

- **Archivo:** `src/services/telegram.commands.service.js`
- **Función:** `executeTelegramCommand(...)`.
- **Qué hace:**
  - Valida que `action` sea OPEN, CLOSE o STOP → si no, devuelve `{ accepted: false, reason: "INVALID_ACTION" }`.
  - **Consulta la DB** vía `getTenantsAndGatesByTelegramId(telegramId)` (mismo repository y misma query que en el flujo 1).
  - Construye el set de `gate_id` a los que ese usuario tiene acceso.
  - Si `gateId` no está en ese set → devuelve `{ accepted: false, reason: "FORBIDDEN" }`.
  - Si está permitido: obtiene la FSM para ese gate (como `portonId`), envía el evento `PRESS`, llama a `onStateChange` (dispatcher → MQTT si corresponde).
  - Devuelve `{ accepted: true }`.

### 4. Repository y DB (igual que en el flujo 1)

- Misma función `getTenantsAndGatesByTelegramId` y mismo **pool**.
- En producción, el pool usa **DATABASE_URL** del servicio del backend en Railway.

### 5. Respuesta hacia el bot

- **Controller** mapea el resultado del service a HTTP:
  - `accepted: true` → **200** `{ accepted: true }`.
  - `reason: "FORBIDDEN"` → **403** `{ accepted: false, reason: "FORBIDDEN" }`.
  - `reason: "INVALID_ACTION"` → **400** `{ accepted: false, reason: "INVALID_ACTION" }`.
  - Cualquier excepción → **500** `{ error: "Internal server error" }`.

### 6. Bot recibe el JSON

- Con **200** puede mostrar “Comando enviado” o similar.
- Con **403** puede mostrar “No tenés permiso para este portón”.
- Con **400** puede mostrar “Acción no válida”.

---

## Resumen: contacto con la base de datos en producción

| Paso | Quién | Dónde (archivo) | Qué hace con la DB |
|------|--------|------------------|---------------------|
| 1 | Bot | (otro repo) | Envía HTTP a tu backend con `telegram_id` o `telegramId` + `gateId` + `action`. |
| 2 | Controller | `api/telegram.controller.js` o `api/telegram.command.controller.js` | Valida request; no toca la DB. |
| 3 | Service | `services/telegram.service.js` o `services/telegram.commands.service.js` | Llama al repository; no escribe SQL. |
| 4 | Repository | `repositories/user.repository.js` | Ejecuta la query con `pool.query(...)` (parámetro `telegram_id`). |
| 5 | Pool | `db/pool.js` | Conecta a PostgreSQL: en producción usa **DATABASE_URL** (Railway). |
| 6 | PostgreSQL | (Railway) | Devuelve filas (users/tenants/gates). |
| 7 | Repository → Service → Controller | Mismos archivos | Transforman filas a JSON y responden al bot. |

Para que todo funcione en producción:

1. **DATABASE_URL** definida en el **servicio del backend** en Railway (URL interna de Postgres de Railway).
2. Tablas **users**, **tenants**, **gates** creadas en la base de Railway (mismo esquema que `scripts/schema.sql`).
3. (Opcional) Datos de prueba en Railway para tu `telegram_id`.
4. Redeploy del backend después de tocar variables.

Con eso, el flujo “bot recibe datos → backend consulta DB → respuesta al bot” queda completo en producción.
