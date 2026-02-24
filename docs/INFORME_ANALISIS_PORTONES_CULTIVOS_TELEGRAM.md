# Informe técnico: Análisis estado actual — Portones, Cultivos y Bot Telegram

**Objetivo:** Documentar con precisión cómo está implementado hoy el módulo Portones, el módulo Cultivos y la integración del bot de Telegram, para poder unir Cultivos (y macetas) al bot usando **exactamente** el mismo patrón arquitectónico que Portones.  
**Alcance:** Solo análisis. Sin propuestas de implementación ni cambios de código.

---

## 1. Módulo Portones — Estado actual

### 1.1 Controller

- **Ubicación:** `src/modules/portones/portones.controller.js`
- **Montaje:** `app.use("/api/portones", portonesRouter)` en `src/index.js`
- **Middleware:** Todas las rutas usan `authenticateJwt`. Las mutaciones (POST, PUT, DELETE) usan además `requireRoles(ADMIN_ACCESS_ROLES)`.
- **Rutas:**
  - `GET /` → lista de portones (scope por usuario)
  - `GET /:id` → un portón por id (validación numérica, 400 si id inválido, 404 si no existe)
  - `POST /` → crear portón (body: portonGroupId, name, type, identifier, topicMqtt, location, state, isActive)
  - `PUT /:id` → actualizar portón (campos opcionales en body)
  - `DELETE /:id` → borrado lógico/eliminación
  - `POST /:id/abrir` → responde **501** con mensaje "Apertura de portón aún no implementada (MQTT pendiente)"
- **Respuestas:** Siempre `toJSONSafe(...)` para evitar BigInt en JSON. Errores: `{ error }` o `{ error, code }` en Prisma. Códigos: 200, 201, 400, 404, 500.

### 1.2 Service

- **Ubicación:** `src/modules/portones/portones.service.js`
- **Dependencias:** Redis (`ensureRedisConnection`), `portones.repository`, `eventos_porton.repository`, `scope` (isSuperadmin, requireAccountId).
- **Patrón:** Cache por clave derivada de usuario (superadmin → clave global; resto → `cache:portones:all:cuenta:{accountId}`). TTL 600 s. Fallback a repository si Redis falla.
- **Funciones expuestas:**
  - `getPortones(usuarioToken)` — lista (con cache)
  - `getPortonById(id, usuarioToken)` — sin cache
  - `createPorton`, `updatePorton`, `removePorton` — mutaciones + `invalidate(usuarioToken)` de cache
  - `abrirPortonConDebounce({ portonId, usuarioToken, canal })` — usado por flujo “abrir”: verifica portón, debounce 2 s en Redis, crea `EventoPorton` (accion `abrir_press`, canal ej. "web"). **No envía MQTT** (apertura física no implementada).
- **Scope:** El service no aplica scope; delega al repository que recibe `usuarioToken`.

### 1.3 Repository

- **Ubicación:** `src/modules/portones/portones.repository.js`
- **Acceso a datos:** Prisma (`infrastructure/database/prismaClient`). Modelo: **Gate** (tabla `gates`) con `include: { portonGroup: true }`.
- **Scope:** Función `whereByScope(usuarioToken)`:
  - Superadmin: sin filtro por cuenta.
  - No superadmin: `portonGroup.accountId = requireAccountId(usuarioToken)`.
  - Si role es **OPERADOR**: además `userGates: { some: { userId: Number(usuarioToken.sub), isActive: true, deletedAt: null } }`.
- **Riesgo:** En el schema Prisma actual **no existen** las tablas `users` ni `user_gates` (fueron eliminadas en la migración `20260223180100_drop_legacy_user_tables`). El modelo `Gate` tiene `membershipGatePermissions`, no `userGates`. Por tanto, la rama OPERADOR de `whereByScope` en este repository podría ser **inconsistente con el schema** (referencia a relación inexistente). El flujo web/JWT que usa este repository podría fallar para operadores o estar apoyado en otro mecanismo (p. ej. scope en middleware o en otro módulo).
- **Operaciones:** `findAllPortones`, `findPortonById`, `createPorton`, `updatePorton`, `deletePorton`. Update/delete usan transacción: primero `findFirst` con scope, luego update/delete por id.

### 1.4 Resolución de usuario por telegramId (flujo bot)

- **En el bot no se usa JWT.** El bot envía en cada petición:
  - Header `x-bot-secret` (valor `TELEGRAM_BOT_INTERNAL_SECRET`)
  - Query o body `telegramId`
- **Resolución:** En `src/infrastructure/telegram/telegram.controller.js`:
  1. `authenticateBotSecret(req, res, next)` — valida el header.
  2. `resolveBotIdentityOrFail(req, res)`:
     - Obtiene `telegramId` de query (GET) o body (POST).
     - Llama a `resolveIdentityFromTelegramId(telegramId)` → **Identity + Credential + memberships**.
     - `resolveIdentityFromTelegramId` está en `src/modules/identity/identity.telegram.service.js` y usa `identityRepository.findCredentialByTypeAndIdentifier("TELEGRAM", telegramId)` (Prisma: `Credential` con `Identity` y `accountMemberships`).
  3. Con la Identity resuelta se llama a `getMemberships(identityId)` (mismo servicio). Si hay un solo membership activo → `activeMembership`; si hay varios → `requiresAccountSelection: true` (se responde sin listar portones/cultivos).
- **Conclusión:** Para el bot, el “usuario” es **Identity + AccountMembership activo**, resuelto únicamente por `telegramId` y el modelo Identity/Credential/AccountMembership. No interviene la tabla `users` ni `user_gates`.

### 1.5 Integración con el bot de Telegram

- El bot **solo** se integra con el backend vía **HTTP**: no importa servicios del backend ni llama a funciones internas.
- Endpoints que el bot usa para Portones (todos bajo `/api/telegram`, con `authenticateBotSecret`):
  - `GET /api/telegram/bot/menu?telegramId=...` — menú principal (módulos habilitados, user, requiresAccountSelection).
  - `GET /api/telegram/bot/modulos/portones/grupos?telegramId=...` — lista de grupos de portones visibles.
  - `GET /api/telegram/bot/modulos/portones/grupos/:grupoId/portones?telegramId=...` — lista de gates del grupo.
  - `POST /api/telegram/bot/portones/:id/abrir` — body `{ telegramId }`. Actualmente responde **501** (“Apertura de portón aún no implementada (MQTT pendiente)”).
- Estos endpoints están implementados en `src/infrastructure/telegram/telegram.controller.js` y usan **Identity + membership** (no user.repository ni SQL directo).

### 1.6 Manejo de errores (Portones / API general)

- **Global:** `src/middleware/errorHandler.js`. Si el error es `AppError`: se loguea con `logger.log` (nivel, modulo, evento, mensaje, userId, cultivoId, macetaId, contexto con request_id y stack) y se responde con `err.statusCode` y body `{ error, modulo, evento, requestId? }`. Cualquier otro error se loguea como error genérico y se responde 500 (o `err.statusCode` si existe).
- **En controllers de Portones:** Validaciones manuales (id numérico, etc.) → 400. Si el service/repository devuelve null (no encontrado) → 404. Excepciones Prisma capturadas en POST/PUT → 400 con mensaje y code, o 500.
- **En telegram.controller (bot):** Try/catch con 500 y `{ error: err.message }`; `resolveBotIdentityOrFail` responde 400/404 con mensajes claros.

### 1.7 Logging

- **Request:** `requestLoggerContext` (en `index.js` antes de rutas) genera `requestId`, extrae/inyecta `userId`, `cultivoId`, `macetaId`, `cicloId` en `req.logContext` y en AsyncLocalStorage para el logger. Al finalizar la respuesta (`res.on('finish')`) se hace `logger.log` con evento `request_completed`, método, URL, statusCode, duracion_ms.
- **Errores:** Ya descritos en errorHandler (AppError y errores genéricos).
- **Módulo Cultivos:** Los controllers de riego (evaluar/adaptar) y log-demo usan `logger.log` con modulo `cultivos` y eventos concretos. Portones no añade logs específicos en el controller; el flujo queda cubierto por el request logger y el error handler.

### 1.8 Estructura de respuestas (API Portones)

- **Éxito:** 200/201 con cuerpo serializado por `toJSONSafe(rows)` (evita BigInt).
- **Error:** 400/404/500 con objeto `{ error: string }`. En algunos POST/PUT con Prisma: `{ error, code }`.
- **Sin cuerpo especial** tipo `{ data: ... }` en listados; el array u objeto va en la raíz del JSON.

---

## 2. Módulo Cultivos — Estado actual

### 2.1 Modelos y tablas involucradas

- **Account** (`accounts`): tenant. Tiene `cultivos`.
- **Cultivo** (`cultivos`): `accountId`, `nombre`, `descripcion`, `isActive`, timestamps, `deletedAt`. Relación con `Account` y con `Maceta[]`.
- **Maceta** (`macetas`): id UUID, `cultivoId`, `nombre`, `identificador`, `isActive`, timestamps. Relación con `Cultivo` y con:
  - `SensoresLectura`, `Riego`, `ParametrosRiego`, `Adaptacion`, `LogSistema`.
- No hay modelo “Usuario” en Prisma; la identificación es Identity/Credential/AccountMembership. Los logs y auditoría pueden usar `identityId` o campos como `userId` en `LogSistema` (legacy o referencias numéricas según diseño).

**Relaciones:** Account → Cultivo → Maceta → (lecturas, riegos, parámetros, adaptaciones, logs). Scope de datos por `Cultivo.accountId` (alineado con Account = tenant).

### 2.2 Controllers y services

- **Controller principal:** `src/modules/cultivos/cultivos.controller.js`
  - Middleware: `authenticateJwt` + `requireRoles(ADMIN_ACCESS_ROLES)` en todo el router.
  - Rutas CRUD: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` (misma estructura que Portones: validación de id, 404 si no existe, toJSONSafe, manejo de Prisma).
  - Sub-routers montados bajo el mismo router:
    - `router.use("/macetas", riegoAdaptacionController)` → `POST /macetas/:macetaId/adaptar`
    - `router.use("/macetas", riegoEvaluacionController)` → `GET /macetas/:macetaId/evaluar`
  - Por tanto, rutas efectivas bajo `/api/cultivos`: `/api/cultivos`, `/api/cultivos/:id`, `/api/cultivos/macetas/:macetaId/evaluar`, `/api/cultivos/macetas/:macetaId/adaptar`.
- **Controller log-demo:** `src/modules/cultivos/cultivos.log-demo.controller.js` montado en `index.js` como `cultivosLogDemoRouter` bajo `/api/cultivos` (antes del router principal de cultivos). Rutas: `GET /api/cultivos/log-demo`, `GET /api/cultivos/log-demo/error`, `POST /api/cultivos/log-demo/with-context`. Requieren JWT y ADMIN.
- **Service:** `src/modules/cultivos/cultivos.service.js`. Mismo patrón que Portones: cache Redis por clave `cache:cultivos:all` (superadmin) o `cache:cultivos:all:cuenta:{accountId}`, TTL 600 s. Funciones: `getCultivos`, `getCultivoById`, `createCultivo`, `updateCultivo`, `removeCultivo`, `invalidate`. No hay servicio expuesto para “listar macetas por cultivo” ni “acción por maceta” a nivel de capa de aplicación HTTP; la lógica de macetas está en los controllers de riego y en sus services (RiegoAdaptativoService, RiegoAdaptacionService).

### 2.3 Repository

- **Ubicación:** `src/modules/cultivos/cultivos.repository.js`
- **Scope:** `scope(usuarioToken)` → superadmin: `{}`; si no: `{ accountId: requireAccountId(usuarioToken) }`. Solo filtro por cuenta; no hay rol OPERADOR con permisos granulares por cultivo/maceta como en Portones con gates.
- **Operaciones:** `findAllCultivos`, `findCultivoById`, `createCultivo`, `updateCultivo`, `deleteCultivo`. Update/delete en transacción con comprobación de existencia y scope.

### 2.4 Endpoints existentes (resumen)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | /api/cultivos | JWT + ADMIN | Lista cultivos (scope por cuenta) |
| GET | /api/cultivos/:id | JWT + ADMIN | Un cultivo por id |
| POST | /api/cultivos | JWT + ADMIN | Crear cultivo |
| PUT | /api/cultivos/:id | JWT + ADMIN | Actualizar cultivo |
| DELETE | /api/cultivos/:id | JWT + ADMIN | Eliminar cultivo |
| GET | /api/cultivos/macetas/:macetaId/evaluar | JWT + ADMIN | Evaluar maceta (riego adaptativo) |
| POST | /api/cultivos/macetas/:macetaId/adaptar | JWT + ADMIN | Adaptar parámetros de maceta |
| GET | /api/telegram/bot/modulos/cultivos | x-bot-secret + telegramId | Lista cultivos para el bot (Identity + membership) |

Los endpoints de macetas (evaluar/adaptar) **no** reciben `cultivoId` en la ruta; solo `macetaId`. El control de que la maceta pertenezca al scope de la cuenta/cultivo debería estar en el service o en un middleware (no revisado en detalle aquí).

### 2.5 Qué falta para que Cultivos sea consumido por Telegram igual que Portones

- **Backend:**
  - Ya existe `GET /api/telegram/bot/modulos/cultivos` que devuelve `{ module, cultivos: [{ id, nombre, descripcion }] }` con scope por Identity + membership (solo ADMIN/SUPERADMIN; operador 403). **No** devuelve macetas por cultivo.
  - No existe en la API del bot:
    - Ningún endpoint “lista de macetas de un cultivo” (equivalente a “portones de un grupo”).
    - Ningún endpoint “acción sobre una maceta” desde Telegram (equivalente conceptual a “abrir portón”; en cultivos podría ser “evaluar” o “adaptar” o consultar estado).
  - El patrón Portones en el bot es: menú → módulo → **lista de grupos** → **lista de ítems del grupo (gates)** → **detalle/acción por ítem**. Para Cultivos el análogo sería: menú → Cultivos → **lista de cultivos** → **lista de macetas del cultivo** → **detalle/acción por maceta**. Hoy el backend del bot solo expone el primer nivel (lista de cultivos).
- **Bot (telegram-bot-portones):**
  - En `backendClient.js` no hay `getCultivos` ni `getMacetasByCultivo` ni equivalente a `openGate` para macetas.
  - En `commands.js`, el callback `mod:cultivos` solo muestra `renderCultivosComingSoon()` (“Módulo Cultivos activo. Próximamente acciones disponibles.”) y **no** llama a ningún endpoint de cultivos. No hay callbacks del tipo `CULTIVOS:CULTIVO:id`, `CULTIVOS:MACETA:id:CULTIVO:id`, ni botonera jerárquica cultivo → macetas → acción.

---

## 3. Cómo interactúa el bot de Telegram con el backend (módulo Portones)

### 3.1 Uso de endpoints HTTP internos

- El bot **solo** se comunica con el backend por **HTTP**, usando el cliente en `telegram-bot-portones/src/api/backendClient.js`.
- No importa módulos del backend ni llama a servicios directamente; toda la interacción es mediante:
  - `GET /api/telegram/bot/menu?telegramId=...`
  - `GET /api/telegram/bot/modulos/portones/grupos?telegramId=...`
  - `GET /api/telegram/bot/modulos/portones/grupos/:grupoId/portones?telegramId=...`
  - `POST /api/telegram/bot/portones/:id/abrir` con body `{ telegramId }`
- Todas estas rutas están en el mismo router que monta `app.use("/api/telegram", telegramRouter)` y usan **authenticateBotSecret** (header `x-bot-secret`) y **telegramId** en query o body. No se usa JWT ni cookies.

### 3.2 Construcción de botoneras

- **Lugar:** `telegram-bot-portones/src/bot/commands.js`.
- **Flujo:** Un solo mensaje por chat que se va **editando** (`editMessageText`). Se mantiene `rootMessageId` por `chatId` en memoria (Map).
- **Convención de callback_data:**
  - `NAV:HOME` → volver al menú principal (llama `getBotMenu`, renderHome con módulos).
  - `NAV:BACK:GROUPS` → volver a lista de grupos de portones.
  - `NAV:BACK:GATES:grupoId` → volver a lista de portones del grupo.
  - `mod:portones` → entrar a Portones (llama `getPortonGroups`, renderGroups).
  - `mod:cultivos` → actualmente solo renderCultivosComingSoon (sin llamada HTTP a cultivos).
  - `mod:ayuda` → ayuda.
  - `PORTONES:GROUP:grupoId` → listar portones del grupo (`getGatesByGroup`), renderGates.
  - `PORTONES:GATE:gateId:GROUP:grupoId` → detalle del gate, renderGateDetail (incluye texto con `/abrir gateId`). El botón “Abrir” usa `GATE:OPEN:...` pero el handler actual responde “Próximamente” sin llamar al backend.
- **Helpers de UI:** `withNav(rows, showInicio, backData)` añade fila “Atrás” y “Inicio”. Un botón por fila. Breadcrumbs en el texto (ej. “🏠 Inicio › 🚪 Portones › 🗂 {groupName}”).

### 3.3 Contexto del usuario en el bot

- **En el bot:** No hay sesión persistente. Cada interacción (callback_query o /start) lleva `telegramId` (y `chatId`, `messageId`). El backend recibe **solo** `telegramId` (y opcionalmente `x-bot-secret`) y en cada request:
  1. Valida el secret.
  2. Resuelve Identity desde Credential TELEGRAM + telegramId.
  3. Obtiene memberships y determina activeMembership o requiresAccountSelection.
  4. Aplica scope (buildPortonGroupScopeForMembership / buildGateScopeForMembership para Portones) y devuelve solo los datos permitidos.
- Por tanto, el “contexto de usuario” es **stateless**: Identity + membership se resuelven en cada request; el bot no guarda usuario ni cuenta en base de datos ni en memoria más allá de la petición.

---

## 4. Arquitectura actual relevante (resumen)

- **API web (Portones, Cultivos, etc.):** Express, JWT (`Bearer`) → `req.user` (identity id, accountId, role, membershipId). Scope por `requireAccountId` y por rol (OPERADOR con permisos por grupo/gate en Identity; en Cultivos solo ADMIN hoy). Patrón Controller → Service (con cache Redis opcional) → Repository → Prisma.
- **API bot:** Prefijo `/api/telegram`. Auth por header `x-bot-secret`. Identidad por `telegramId` → Identity → AccountMembership. Mismo router en `infrastructure/telegram/telegram.controller.js` para menu, portones (grupos, gates) y cultivos (solo lista). Scope por membership (buildPortonGroupScopeForMembership, buildGateScopeForMembership; para cultivos: where por accountId o superadmin).
- **Dos capas de “resolución por telegramId”:**
  - **Bot (vigente):** Identity + Credential TELEGRAM + AccountMembership (Prisma). Usado por todos los endpoints bajo `/api/telegram/bot/...`.
  - **Legacy (posible código muerto):** `user.repository.getAuthorizedGatesByTelegramId(telegramId)` usa SQL sobre `users` y `user_gates`. Esas tablas fueron eliminadas en migración; por tanto este camino está roto o no se usa. Los endpoints que lo usan (p. ej. `GET /api/telegram/tenants` en `infrastructure/http/telegram.controller.js` y, si existiera, `POST /api/telegram/command`) dependerían de ese modelo antiguo. El flujo actual del bot no usa esos endpoints; usa solo los de `infrastructure/telegram/telegram.controller.js`.

---

## 5. Flujo de datos (Portones vs Cultivos, bot)

- **Portones (bot):**  
  Usuario toca “Portones” → Bot GET grupos (telegramId) → Backend resuelve Identity + membership, aplica scope, devuelve grupos → Bot muestra botones por grupo → Usuario elige grupo → Bot GET portones del grupo → Backend aplica scope (incl. operador por grupo/gate), devuelve gates → Bot muestra botones por gate → Usuario puede ver detalle; “Abrir” actualmente no ejecuta apertura (501).
- **Cultivos (bot):**  
  Usuario toca “Cultivos” → Bot **no** llama al backend; muestra mensaje “próximamente”. El backend ya tiene lista de cultivos en `GET /api/telegram/bot/modulos/cultivos` pero el bot no la usa. No hay flujo cultivo → macetas → acción.

---

## 6. Dependencias

- **Portones (API):** express, Prisma (Gate, PortonGroup), Redis (cache), scope (auth.types, scope.js), middleware authenticateJwt, requireRoles, toJSONSafe, eventos_porton.repository (solo en abrirPortonConDebounce).
- **Portones (bot backend):** express, prisma (PortonGroup, Gate), identity.telegram.service (resolveIdentityFromTelegramId, getMemberships, isPortonesEnabledForMembership, buildPortonGroupScopeForMembership, buildGateScopeForMembership, MEMBERSHIP_ROLES).
- **Cultivos (API):** express, Prisma (Cultivo), Redis, scope, authenticateJwt, requireRoles, toJSONSafe, RiegoAdaptacionController, RiegoEvaluacionController (y sus services).
- **Bot (cliente):** backendClient con getBotMenu, getPortonGroups, getGatesByGroup, openGate. Ningún método para cultivos ni macetas.

---

## 7. Posibles riesgos

1. **Repository Portones y OPERADOR:** `portones.repository.js` usa `userGates` en `whereByScope` para rol OPERADOR, pero el schema Prisma ya no tiene `users` ni `user_gates`. Riesgo de error en runtime para usuarios operadores en la API web o de código obsoleto a actualizar.
2. **Dualidad users vs Identity:** Código que aún usa `user.repository.getAuthorizedGatesByTelegramId` (SQL sobre `users`/`user_gates`) está desalineado con el schema y con el flujo actual del bot (Identity). Conviene identificar todos los usos y unificar en Identity o eliminar el camino legacy.
3. **POST /bot/portones/:id/abrir:** Responde 501. Cuando se implemente MQTT/debounce, habrá que reutilizar la misma autorización (Identity + membership + scope por gate) que ya usa el resto del controller.
4. **Cultivos: macetas sin endpoint bot:** Las acciones de maceta (evaluar/adaptar) existen solo en la API JWT. Para igualar el patrón Portones en Telegram hace falta exponer al menos “macetas por cultivo” y, si se desea, una acción por maceta vía endpoints bot con el mismo esquema de auth (x-bot-secret + telegramId).
5. **Selección de cuenta:** Si un usuario tiene varios memberships (requiresAccountSelection), el bot muestra mensaje “seleccioná una (pendiente)” y no permite elegir cuenta. El flujo completo multi-cuenta en el bot está pendiente.

---

## 8. Lista clara de lo que falta (para que Cultivos se comporte como Portones en el bot)

- **Backend (controlador Telegram):**
  - Endpoint “lista de macetas de un cultivo” (equivalente a “portones de un grupo”), con mismo auth (x-bot-secret + telegramId) y scope por Identity + membership sobre cultivos de la cuenta (y que el cultivo pertenezca a la cuenta del membership). Formato análogo a grupos/portones (ej. `GET /api/telegram/bot/modulos/cultivos/:cultivoId/macetas?telegramId=...`).
  - (Opcional) Endpoint(s) de “acción por maceta” desde el bot (p. ej. consultar estado, disparar evaluar/adaptar) con la misma convención de autorización y scope, si se quieren acciones desde Telegram similares a “abrir portón”.
- **Bot (backendClient):**
  - Método para obtener lista de cultivos (hoy el backend ya devuelve cultivos en `GET /bot/modulos/cultivos`; el bot no lo consume).
  - Método para obtener macetas de un cultivo (cuando exista el endpoint anterior).
  - (Opcional) Método para ejecutar acción sobre una maceta (cuando exista el endpoint).
- **Bot (commands.js):**
  - Handler para `mod:cultivos`: llamar al backend para lista de cultivos y mostrar botonera de cultivos (como grupos en Portones).
  - Callbacks tipo `CULTIVOS:CULTIVO:cultivoId` → listar macetas (llamada al nuevo endpoint) y mostrar botonera de macetas.
  - Callbacks tipo `CULTIVOS:MACETA:macetaId:CULTIVO:cultivoId` → detalle/acción de maceta (y navegación “Atrás” a macetas del cultivo).
  - Navegación “Atrás” e “Inicio” coherente con Portones (NAV:BACK:CULTIVOS, NAV:BACK:MACETAS:cultivoId, etc.).
  - Tratamiento de errores HTTP (401, 403, 404, 500) igual que en Portones (errorMessageForStatus y mensajes al usuario).
- **Consistencia de patrón:**
  - Misma resolución de usuario: solo telegramId + x-bot-secret → Identity → membership → scope por cuenta/rol.
  - Misma estructura de respuestas del backend (objeto con lista o ítem, sin cambiar convenciones de la API actual).
  - Misma convención de callback_data y breadcrumbs en el bot para Cultivos que para Portones (módulo → lista de “grupos” (cultivos) → lista de “ítems” (macetas) → detalle/acción).

---

**Fin del informe.** No se incluyen propuestas de implementación ni cambios de código; solo descripción técnica del estado actual y de lo que faltaría para que Cultivos siga el mismo patrón que Portones en el bot.
