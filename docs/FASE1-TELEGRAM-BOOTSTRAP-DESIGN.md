# Fase 1 — Telegram Bootstrap — Diseño de arquitectura

**Rol:** Backend Architect / Senior Node.js Engineer  
**Alcance:** Extensión mínima del backend para soportar bootstrap del bot (usuario → tenants → gates).  
**Restricción:** Sin código aún; no tocar MQTT ni FSM.

---

## 1. Análisis estructural actual

### 1.1 Árbol de directorios

```
controlador-central-portones/
├── .env.example
├── .gitignore
├── .railwayignore
├── package.json
├── README.md
├── docs/
│   ├── README.md
│   ├── SETUP-WINDOWS.md
│   └── FASE1-TELEGRAM-BOOTSTRAP-DESIGN.md   ← este documento
└── src/
    ├── index.js                 # Entrypoint: Express, MQTT, FSM registry, montaje de /api
    ├── config/
    │   └── env.js               # Solo mqtt (brokerUrl, username, password, clientId, testOnConnect)
    ├── core/
    │   └── stateMachine.js      # FSM estados/eventos — NO TOCAR
    ├── api/
    │   └── events.controller.js # createEventsRouter, POST /api/events — NO TOCAR
    └── mqtt/
        └── mqttClient.js        # MQTT connect/subscribe/publish — NO TOCAR
```

### 1.2 Dependencias actuales

- **express** — servidor HTTP
- **dotenv** — variables de entorno
- **mqtt** — broker

No hay cliente PostgreSQL ni ORM.

### 1.3 Flujo actual del entrypoint

1. Carga `dotenv`.
2. Valida config MQTT; sale si falta.
3. Crea `stateMachineRegistry` (Map) y `getStateMachine`.
4. Crea e inicia cliente MQTT (inyección de `getStateMachine` y `onStateChange`).
5. Crea app Express, monta `createEventsRouter(...)` en `/api`.
6. `app.listen(PORT)`.
7. Maneja SIGINT para desconectar MQTT.

La única ruta HTTP actual es `POST /api/events`.

### 1.4 Conclusión del análisis

- No existe capa de datos ni modelo users/tenants/gates.
- No hay separación explícita routers vs controllers; `events.controller.js` exporta un router.
- Config centralizada en `config/env.js` solo para MQTT.
- El montaje de rutas es en `index.js` (un solo `app.use("/api", createEventsRouter(...))`).

---

## 2. Propuesta de arquitectura

### 2.1 Principios

- **Capa de datos** independiente de la lógica de negocio.
- **Servicios** orquestan repositorios y definen reglas (ej. “usuario no existe → 403”).
- **Rutas/controllers** solo validan entrada HTTP, llaman servicios y formatean respuestas.
- **No tocar** `core/`, `mqtt/`, ni el comportamiento de `api/events.controller.js`.
- **PostgreSQL** como única fuente de verdad para usuarios, tenants y gates.

### 2.2 Capas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HTTP (Express)                                                              │
│  Rutas: /api/events (existente)  |  /api/telegram/* (nuevo)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Controllers / Routers                                                       │
│  - events.controller.js (existente)                                          │
│  - telegram.controller.js o telegram.routes.js (nuevo)                       │
│  Responsabilidad: validar query/body, llamar servicio, devolver JSON/status  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Services (lógica de negocio)                                                │
│  - telegramBootstrap.service.js (nuevo)                                      │
│  Responsabilidad: “obtener usuario por telegramUserId; si no existe → null;   │
│                   si existe → tenants con gates”; sin conocer HTTP           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Repositories (acceso a datos)                                               │
│  - user.repository.js                                                        │
│  - tenant.repository.js (o user+tenant+gate en repos separados según tamaño)  │
│  - gate.repository.js                                                        │
│  Responsabilidad: queries a PostgreSQL; devolver objetos planos o DTOs       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB (PostgreSQL)                                                             │
│  - Conexión: pool o cliente (pg)                                             │
│  - Ubicación: src/db/ o src/config/ (solo conexión, sin lógica)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Modelo de datos (PostgreSQL) — supuesto para el diseño

Para que el contrato y las capas sean concretos, se asume un modelo mínimo:

- **users**  
  - `id` (PK), `telegram_user_id` (único, string o bigint según cómo llegue de Telegram).

- **tenants**  
  - `id` (PK), `name`, y relación N:1 o N:M con users (ej. `user_id` en tenants o tabla `user_tenants`).

- **gates**  
  - `id` (PK), `name`, `tenant_id` (FK).

La definición exacta de tablas y migraciones queda para la fase de implementación; aquí solo se asume que existe “usuario por telegram_user_id”, “tenants del usuario” y “gates por tenant”.

### 2.4 Ubicación de archivos propuesta

```
src/
├── index.js                        # MODIFICAR: montar nuevo router + inicializar DB (opcional al arranque)
├── config/
│   └── env.js                      # MODIFICAR: añadir sección db (DATABASE_URL)
├── core/
│   └── stateMachine.js             # NO TOCAR
├── mqtt/
│   └── mqttClient.js               # NO TOCAR
├── api/
│   ├── events.controller.js        # NO TOCAR
│   └── telegram.routes.js          # NUEVO: router GET /api/telegram/bootstrap
├── services/
│   └── telegramBootstrap.service.js # NUEVO: lógica bootstrap
├── repositories/
│   ├── user.repository.js          # NUEVO: findByTelegramUserId, etc.
│   ├── tenant.repository.js        # NUEVO: findByUserId (o con gates incluidos)
│   └── gate.repository.js         # NUEVO: findByTenantId (o integrado en tenant)
└── db/
    └── client.js                   # NUEVO: pool PostgreSQL (pg)
```

Alternativa válida: un solo `telegram.repository.js` que exponga `getBootstrapData(telegramUserId)` y haga las queries necesarias, si se prefiere menos archivos en esta fase.

---

## 3. Contrato del endpoint

### 3.1 Especificación

| Atributo | Valor |
|----------|--------|
| Método | `GET` |
| Ruta | `/api/telegram/bootstrap` |
| Query params | `telegramUserId` (string o number; Telegram envía number, aceptar ambos) |
| Content-Type respuesta | `application/json` |

### 3.2 Casos de éxito

**Usuario existe (con o sin tenants):**

- **Status:** `200 OK`
- **Body (ejemplo):**

```json
{
  "user": { "id": 1, "telegramUserId": "123456789" },
  "tenants": [
    {
      "id": 10,
      "name": "Tenant A",
      "gates": [
        { "id": 100, "name": "Gate 1" },
        { "id": 101, "name": "Gate 2" }
      ]
    },
    {
      "id": 11,
      "name": "Tenant B",
      "gates": []
    }
  ]
}
```

- `tenants` es siempre un array (vacío si el usuario no tiene tenants).
- Cada tenant incluye `gates` (array de objetos con `id` y `name`).

### 3.3 Casos de error

| Situación | HTTP | Body (ejemplo) |
|-----------|------|----------------|
| `telegramUserId` ausente o vacío | `400 Bad Request` | `{ "error": "telegramUserId is required" }` |
| Usuario no existe para ese `telegramUserId` | `403 Forbidden` | `{ "error": "User not found" }` (o mensaje acordado) |
| Error de base de datos / servidor | `500 Internal Server Error` | `{ "error": "Internal server error" }` (sin filtrar detalles internos al cliente) |

No se requiere autenticación por token en este endpoint; la identificación es por `telegramUserId` en query (el bot es el único cliente que debe conocer este endpoint; endurecer después con API key o similar si hace falta).

### 3.4 Contrato backend ↔ bot de Telegram

- **Quién llama:** Bot de Telegram (backend del bot), tras identificar al usuario por su Telegram user id.
- **Cuándo:** Al iniciar sesión o al necesitar refrescar la lista de tenants/gates (por ejemplo al abrir el menú principal).
- **Request:** `GET /api/telegram/bootstrap?telegramUserId=<telegram_user_id>`.
- **Response:** JSON anterior; el bot mapea `user`, `tenants` y `tenants[].gates` a su UI (menús, inline keyboards, etc.).
- **Errores:** El bot debe tratar 403 como “usuario no registrado” (mensaje o flujo de registro) y 400 como parámetro inválido.

Documentar este contrato en un pequeño “API contract” en repo (ej. `docs/API-TELEGRAM-BOOTSTRAP.md`) para que tanto el backend como el bot lo usen como referencia.

---

## 4. Variables de entorno

### 4.1 Nuevas (Fase 1)

| Variable | Obligatoria | Descripción | Ejemplo |
|----------|-------------|-------------|---------|
| `DATABASE_URL` | Sí (para esta fase) | URL de conexión PostgreSQL | `postgresql://user:password@host:5432/dbname` |

### 4.2 Existentes (sin cambio)

- `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID`, `MQTT_TEST_ON_CONNECT`
- `PORT`

### 4.3 Actualización de `.env.example`

Añadir bloque comentado:

```env
# PostgreSQL (obligatorio para API Telegram bootstrap)
DATABASE_URL=postgresql://user:password@localhost:5432/controlador_portones
```

### 4.4 Comportamiento al arranque

- Si se monta el router `/api/telegram/*`, el servidor debe poder arrancar solo con `DATABASE_URL` (y MQTT como hasta ahora). Si `DATABASE_URL` falta, opciones: (A) no montar rutas de Telegram y arrancar solo MQTT/events, o (B) fallar el arranque. Para Fase 1 se recomienda (B) si este backend es ya el único responsable de datos: si falta `DATABASE_URL`, no arrancar.

---

## 5. Checklist de cambios

### 5.1 No tocar

- [ ] `src/core/stateMachine.js`
- [ ] `src/mqtt/mqttClient.js`
- [ ] `src/api/events.controller.js`
- [ ] Comportamiento de `POST /api/events` y de la FSM/MQTT

### 5.2 Crear

- [ ] `src/db/client.js` — crear pool `pg` y exportar (o conexión única según convención).
- [ ] `src/config/env.js` — añadir clave `db: { databaseUrl: process.env.DATABASE_URL }` (sin eliminar `mqtt`).
- [ ] `src/repositories/user.repository.js` — al menos `findByTelegramUserId(telegramUserId)`.
- [ ] `src/repositories/tenant.repository.js` — al menos listar tenants por user (y opcionalmente con gates).
- [ ] `src/repositories/gate.repository.js` — al menos listar gates por tenant (o integrado en tenant).
- [ ] `src/services/telegramBootstrap.service.js` — `getBootstrap(telegramUserId)` → `{ user, tenants }` o null si no existe usuario.
- [ ] `src/api/telegram.routes.js` — router con `GET /bootstrap`, validación de query, llamada al servicio, respuestas 200/400/403/500.
- [ ] Documento de contrato (ej. `docs/API-TELEGRAM-BOOTSTRAP.md`) con método, ruta, query, respuestas y errores.

### 5.3 Modificar

- [ ] `src/index.js` — requerir nuevo router de Telegram y montarlo: `app.use("/api/telegram", telegramRouter)` (o equivalente). Inicializar DB al arranque si se elige “fallar si no hay DATABASE_URL”.
- [ ] `src/config/env.js` — añadir configuración `db` como arriba.
- [ ] `.env.example` — añadir `DATABASE_URL` comentado.

### 5.4 Dependencias

- [ ] Añadir en `package.json`: `pg` (cliente PostgreSQL oficial).

### 5.5 Base de datos

- [ ] Definir esquema (migraciones o SQL inicial): tablas `users`, `tenants`, `gates` y relaciones (user–tenant, tenant–gate). Fuera del alcance de este documento de diseño; solo checklist.

### 5.6 Testing y mantenimiento

- [ ] Servicio y repositorios inyectando dependencias (ej. pool de DB) para poder testear con mocks.
- [ ] Routers solo delegando en servicios; tests de integración del endpoint con DB de prueba o mocks del servicio.

---

## 6. Resumen

- **Estructura actual:** Entrypoint en `index.js`, un router de eventos bajo `/api`, FSM y MQTT intactos; sin DB ni usuarios/tenants/gates.
- **Arquitectura propuesta:** Capa `db/`, `repositories/`, `services/`, y router `api/telegram.routes.js` sin tocar `core/`, `mqtt/` ni `events.controller.js`.
- **Contrato:** `GET /api/telegram/bootstrap?telegramUserId=<id>` → 200 con `{ user, tenants }` o 403 si usuario no existe; 400 si falta parámetro.
- **Entorno:** `DATABASE_URL` obligatorio para esta fase; documentar en `.env.example` y en docs.
- **Checklist:** Crear DB client, config db, repos, servicio, router y documento de contrato; modificar solo `index.js`, `env.js` y `.env.example`; añadir `pg`; dejar FSM/MQTT/events sin cambios.

Con esto se puede pasar a la fase de implementación (prompts de codificación, migraciones y pruebas).
