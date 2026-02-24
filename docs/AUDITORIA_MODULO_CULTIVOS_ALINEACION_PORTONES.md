# Auditoría técnica: Módulo Cultivos y alineación con patrón Portones

**Alcance:** Análisis exclusivamente. Sin implementación, sin modificación de archivos, sin código nuevo.

---

## 1. Análisis del schema Prisma

### 1.1 Modelo Cultivo

| Campo       | Tipo      | Restricciones / Notas |
|------------|-----------|------------------------|
| id         | Int       | PK, autoincrement      |
| accountId  | Int       | FK → Account.id        |
| nombre     | String    | —                      |
| descripcion| String?   | nullable               |
| isActive   | Boolean   | default true, @map("is_active") |
| createdAt  | DateTime  | default now()         |
| updatedAt  | DateTime  | updatedAt              |
| deletedAt  | DateTime? | nullable, soft delete  |

- **Relaciones:** `account` → Account (onDelete: **Restrict**). `macetas` → Maceta[].
- **Índice:** `idx_cultivos_account_id` en `accountId`.
- **Tabla:** `cultivos`.

### 1.2 Modelo Maceta

| Campo      | Tipo    | Restricciones / Notas |
|-----------|--------|------------------------|
| id        | String | PK, UUID (gen_random_uuid()) |
| cultivoId | Int    | FK → Cultivo.id       |
| nombre    | String | —                      |
| identificador | String? | nullable          |
| isActive  | Boolean | default true, @map("is_active") |
| createdAt | DateTime | default now()        |
| updatedAt | DateTime | updatedAt             |

- **No tiene:** `accountId` (solo acceso a cuenta vía Cultivo).
- **No tiene:** `deletedAt` (no hay soft delete en Maceta).
- **Relaciones:** `cultivo` → Cultivo (onDelete: **Restrict**). Hijos: SensoresLectura, Riego, ParametrosRiego, Adaptacion, LogSistema.
- **Índice:** `idx_macetas_cultivo_id` en `cultivoId`.
- **Tabla:** `macetas`.

### 1.3 Relaciones exactas (diagrama lógico textual)

```
Identity
  ├── credentials[]        → Credential (type TELEGRAM, identifier = telegramId)
  └── accountMemberships[] → AccountMembership

AccountMembership
  ├── identityId → Identity
  ├── accountId  → Account
  ├── portonGroups[]  → MembershipPortonGroup (solo Portones)
  └── gatePermissions[] → MembershipGatePermission (solo Portones)

Account
  ├── accountMemberships[] → AccountMembership
  ├── portonGroups[]       → PortonGroup
  ├── eventosPorton[]      → EventoPorton
  └── cultivos[]           → Cultivo

Cultivo
  ├── accountId → Account
  └── macetas[] → Maceta

Maceta
  └── cultivoId → Cultivo
```

**Cadena de pertenencia a la cuenta:**

- **Identity → cuenta:** Identity → AccountMembership (accountId) → Account. No hay relación directa Identity ↔ Cultivo ni Identity ↔ Maceta.
- **Cultivo → cuenta:** Cultivo.accountId → Account. Un cultivo pertenece a una sola cuenta.
- **Maceta → cuenta:** Maceta.cultivoId → Cultivo.accountId → Account. Solo referencia indirecta; la cuenta se obtiene vía Cultivo.

### 1.4 Maceta: resumen de atributos

| Atributo        | ¿Existe? | Nota |
|-----------------|----------|------|
| accountId       | No       | Solo indirecto: Maceta → Cultivo → Account. |
| Soft delete     | No       | No hay campo `deletedAt` en Maceta. |
| isActive        | Sí       | Boolean, default true. |
| createdAt       | Sí       | DateTime, default now(). |
| updatedAt       | Sí       | DateTime, updatedAt. |

### 1.5 Restricciones y cascadas

| Relación              | onDelete  | Efecto |
|-----------------------|-----------|--------|
| Cultivo → Account     | Restrict  | No se puede borrar Account si tiene Cultivos. |
| Maceta → Cultivo      | Restrict  | No se puede borrar Cultivo si tiene Macetas. |
| AccountMembership → Account | Cascade | Borrar cuenta borra memberships. |
| Credential → Identity | Cascade  | Borrar Identity borra credenciales. |

**Conclusión schema:** La autorización para Cultivos/Macetas se resuelve por **Account**: el membership tiene `accountId`; Cultivo tiene `accountId`; Maceta se ata a la cuenta solo mediante `Cultivo.cultivoId` → `Cultivo.accountId`. No existe en el schema ningún equivalente a MembershipPortonGroup / MembershipGatePermission para Cultivo o Maceta (sin “permisos granulares” por cultivo/maceta para operadores).

---

## 2. Cómo Portones construye el scope

### 2.1 buildPortonGroupScopeForMembership(membership)

**Entrada:** `membership` con `role`, `accountId`, y opcionalmente `portonGroups`, `gatePermissions` (según include del repository).

**Lógica:**

1. **Sin membership:** devuelve `{ id: -1 }` (where imposible → 0 resultados).
2. **SUPERADMIN:** `{ isActive: true, deletedAt: null }` — ve todos los grupos activos, sin filtrar por cuenta.
3. **ADMIN:** `{ accountId: membership.accountId, isActive: true, deletedAt: null }` — solo grupos de su cuenta.
4. **OPERATOR:**  
   - Lista de IDs de grupos: `membership.portonGroups` (portonGroupId) y de grupos derivados de gates: `membership.gatePermissions` → gate.portonGroupId.  
   - Si no hay ninguno → `{ id: -1 }`.  
   - Si hay → `{ id: { in: allGroupIds }, accountId: membership.accountId, isActive: true, deletedAt: null }`.

**Salida:** Objeto “where” para Prisma sobre PortonGroup. Para OPERATOR se valida tanto “pertenencia a la cuenta” (`accountId`) como “pertenencia al conjunto de grupos permitidos” (`id in [...]`).

### 2.2 Validación de pertenencia al grupo (ej. GET grupos/:grupoId/portones)

- Se construye `groupScope = buildPortonGroupScopeForMembership(ctx.activeMembership)`.
- Si `groupScope.id === -1` → 404.
- **groupWhere:** `{ id: grupoId, isActive: true, deletedAt: null }`.  
  - Si el scope tiene `accountId` → se añade `groupWhere.accountId = groupScope.accountId`.  
  - Si el scope tiene `id: { in: [...] }` → se comprueba `groupScope.id.in.includes(grupoId)`; si no está → 404.
- `prisma.portonGroup.findFirst({ where: groupWhere })`. Si no hay fila → 404.
- Conclusión: se valida que el grupo existe, está activo, no está borrado y **pertenece al scope del membership** (cuenta y, para operador, lista de grupos permitidos).

### 2.3 Rol (ADMIN / OPERATOR)

- **SUPERADMIN:** Sin filtro por cuenta en grupos; en gates el scope devuelto por `buildGateScopeForMembership` no restringe por cuenta (acceso total en la práctica).
- **ADMIN:** Filtro por `accountId` del membership en grupos; en gates no se usa lista de gates/grupos (ve todos los gates de su cuenta al listar por grupo).
- **OPERATOR:** Solo grupos/gates que estén en `MembershipPortonGroup` o `MembershipGatePermission`; si no tiene ninguno, scope `id: -1`. Además, al listar gates de un grupo se filtra: o tiene el grupo completo o solo los gates con permiso explícito.

En Cultivos **no** existe hoy equivalente a OPERATOR con permisos por ítem: el módulo devuelve 403 a OPERATOR en todos los endpoints de cultivos en el bot.

---

## 3. identity.telegram.service — Resolución de membership y seguridad

### 3.1 Resolución de membership

1. **resolveIdentityFromTelegramId(telegramId)**  
   - Llama a `identityRepository.findCredentialByTypeAndIdentifier("TELEGRAM", String(telegramId))`.  
   - Prisma: `Credential` con `include: { identity: { include: { accountMemberships: { where: { status: "ACTIVE" }, include: { account: true } } } } }`.  
   - Si no hay credential o no está activa o no tiene identity → `null`.  
   - Devuelve `{ identity, credential, memberships }` con `memberships = identity.accountMemberships` filtrado por `status === "ACTIVE"`.

2. **getMemberships(identityId)**  
   - Llama a `identityRepository.getMembershipsWithScopes(identityId)`:  
     - `AccountMembership` con `identityId`, `status: "ACTIVE"`.  
     - `include: { account: true, portonGroups: { include: { portonGroup: true } }, gatePermissions: { include: { gate: { include: { portonGroup: true } } } } }`.  
   - Si 0 memberships → `{ memberships: [], activeMembership: null, requiresAccountSelection: false }`.  
   - Si 1 membership → `{ memberships, activeMembership: memberships[0], requiresAccountSelection: false }`.  
   - Si >1 → `{ memberships, activeMembership: null, requiresAccountSelection: true }`.

Ninguna de estas funciones carga Cultivos ni Macetas; el membership trae solo `accountId`, `role`, `account`, y para Portones `portonGroups` y `gatePermissions`.

### 3.2 Datos que devuelve exactamente (contexto bot)

Tras `resolveBotIdentityOrFail` (en el controller), cuando hay un único membership activo se usa:

- **ctx.identity:** id, fullName, createdAt, updatedAt (y relaciones no usadas en el flujo cultivos).
- **ctx.activeMembership:** id, identityId, accountId, role, status, account (name, etc.), y para Portones portonGroups, gatePermissions.
- **ctx.requiresAccountSelection:** false en el caso “un solo membership”.

Para GET /bot/modulos/cultivos el controller usa solo: `ctx.activeMembership.role` y `ctx.activeMembership.accountId`.

### 3.3 Garantías de seguridad

- **Autenticación del canal:** El bot usa `x-bot-secret`; solo quien conozca `TELEGRAM_BOT_INTERNAL_SECRET` puede llamar a estos endpoints. No se usa JWT ni cookie.
- **Identificación del usuario:** Solo mediante `telegramId`; el backend no confía en ningún identificador que envíe el bot salvo el resuelto por Credential TELEGRAM.
- **Credencial activa:** Si la credential no está activa o no existe, `resolveIdentityFromTelegramId` devuelve null → 404.
- **Solo memberships ACTIVE:** Tanto en findCredential (where en accountMemberships) como en getMemberships (where status: "ACTIVE").
- **Multi-cuenta:** Si hay más de un membership activo no se elige cuenta automáticamente; se responde `requiresAccountSelection` y no se exponen datos de ninguna cuenta. Evita fuga de datos por “primera cuenta” implícita.
- **Rol:** OPERATOR recibe 403 en el endpoint de cultivos; no hay datos de cultivos para operadores en el bot.

---

## 4. Endpoint existente GET /api/telegram/bot/modulos/cultivos

### 4.1 Controller

- **Archivo:** `src/infrastructure/telegram/telegram.controller.js`.  
- **Ruta:** `router.get("/bot/modulos/cultivos", authenticateBotSecret, async (req, res) => { ... })`.  
- **Montaje:** Bajo `app.use("/api/telegram", telegramRouter)` → URL efectiva: `GET /api/telegram/bot/modulos/cultivos`.

### 4.2 Flujo (sin service dedicado)

1. **authenticateBotSecret:** Valida header `x-bot-secret`; 503 si no está configurado el env; 401 si no coincide.
2. **resolveBotIdentityOrFail:** Obtiene `telegramId` de query; 400 si falta; llama a resolveIdentityFromTelegramId + getMemberships; 404 si no hay usuario o sin membership activo; si requiresAccountSelection devuelve 200 con requiresAccountSelection y sin listar cultivos (en este endpoint en concreto el controller hace return 400 con mensaje “Selección de cuenta requerida”).
3. **Rol OPERATOR:** Si `ctx.activeMembership.role === MEMBERSHIP_ROLES.OPERATOR` → 403 "Sin acceso al módulo cultivos".
4. **Where:**  
   - SUPERADMIN: `{ isActive: true, deletedAt: null }`.  
   - Otros (ADMIN): `{ accountId: ctx.activeMembership.accountId, isActive: true, deletedAt: null }`.
5. **Lectura:** `prisma.cultivo.findMany({ where, orderBy: { id: "asc" } })`.
6. **Respuesta:** 200, body `{ module: "cultivos", cultivos: cultivos.map(c => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion })) }`.
7. Cualquier excepción → 500 `{ error: err.message }`.

### 4.3 Validaciones

- telegramId presente y válido (vía resolveBotIdentityOrFail).
- Usuario Telegram existente y activo (credential + identity).
- Al menos un membership activo y, si hay solo uno, se usa ese (si no, 400 por selección de cuenta).
- Rol distinto de OPERATOR para el módulo cultivos.
- No se valida formato de query más allá de que telegramId llegue (no hay validación de tipos para otros query params porque no se usan).

### 4.4 Estructura de respuesta

- **200 OK:**  
  `{ "module": "cultivos", "cultivos": [ { "id": number, "nombre": string, "descripcion": string | null } ] }`.
- **400:** `{ "error": "telegramId es requerido" }` o `{ "error": "Selección de cuenta requerida", "requiresAccountSelection": true }`.
- **403:** `{ "error": "Sin acceso al módulo cultivos" }`.
- **404:** `{ "error": "Usuario de Telegram no encontrado o inactivo" }` o `{ "error": "Sin membership activo en ninguna cuenta" }`.
- **500:** `{ "error": string }`.
- **503:** `{ "error": "TELEGRAM_BOT_INTERNAL_SECRET no configurado" }`.
- **401:** `{ "error": "Bot secret inválido" }`.

No hay paginación; se devuelven todos los cultivos del scope.

---

## 5. Qué faltaría para GET /api/telegram/bot/modulos/cultivos/:cultivoId/macetas

### 5.1 Validación de que el cultivo pertenece a la cuenta del membership

Debe aplicarse el **mismo patrón** que en Portones para “grupo por id”:

1. Obtener **scope de cultivos** para el membership:
   - **SUPERADMIN:** `{ isActive: true, deletedAt: null }`.
   - **ADMIN:** `{ accountId: membership.accountId, isActive: true, deletedAt: null }`.
   - **OPERATOR:** En el diseño actual del módulo cultivos → 403 (no se lista ningún cultivo ni maceta). Si en el futuro se diera acceso a operadores con permisos granulares (ej. “solo cultivos X, Y”), haría falta un equivalente a MembershipPortonGroup para Cultivo y un `buildCultivoScopeForMembership`; hoy no existe.

2. Construir **cultivoWhere** para el `cultivoId` de la URL:
   - `{ id: cultivoId (numérico), isActive: true, deletedAt: null }`.
   - Si el scope incluye `accountId` (ADMIN), añadir `accountId: ctx.activeMembership.accountId`.
   - Para SUPERADMIN no se añade accountId (ve todas las cuentas).

3. **findFirst** Cultivo con ese where. Si no hay resultado → 404 "Cultivo no encontrado o sin acceso".

4. Con el cultivo validado, listar macetas con `where: { cultivoId: cultivo.id, isActive: true }` (Maceta no tiene deletedAt). Opcionalmente filtrar por `isActive` si se desea ocultar macetas desactivadas.

Así se garantiza que el cultivo pertenece a la cuenta del membership (o está en el scope permitido para SUPERADMIN) antes de exponer macetas.

### 5.2 ¿Maceta necesita validación adicional?

**No**, siempre que la validación del cultivo sea correcta:

- Maceta solo tiene `cultivoId`; no hay accountId ni otra relación directa a la cuenta.
- Si el cultivo fue validado (pertenece al scope del membership), entonces todas las macetas de ese cultivo pertenecen a la misma cuenta. No hace falta comprobar “pertenencia de la maceta a la cuenta” por separado; basta con filtrar macetas por `cultivoId` del cultivo ya autorizado.

La única validación adicional razonable sería de **existencia y formato** del `cultivoId` (numérico, no NaN) antes de hacer el findFirst, análogo a `grupoId` en Portones.

### 5.3 ¿Se puede reutilizar el patrón exacto de Portones?

**Sí**, con una simplificación:

- **Portones:** Tiene OPERATOR con scope por grupos/gates (buildPortonGroupScopeForMembership con `id: { in: [...] }`). Para “grupos/:grupoId/portones” se valida que grupoId esté en ese scope y que el grupo exista con ese accountId/isActive/deletedAt.
- **Cultivos (estado actual):** Solo ADMIN y SUPERADMIN; no hay “scope por lista de cultivos” para OPERATOR. El “scope de cultivo” sería:
  - SUPERADMIN: where global (isActive, deletedAt).
  - ADMIN: where por accountId + isActive + deletedAt.

Por tanto el patrón es el mismo: (1) resolver Identity + membership, (2) 403 para OPERATOR (en cultivos), (3) construir where del recurso “padre” (Cultivo) según rol, (4) validar que el id del padre (cultivoId) existe y cumple ese where, (5) listar hijos (Macetas) por clave foránea (cultivoId). La única diferencia es que en Cultivos no existe (por ahora) un “buildCultivoScopeForMembership” reutilizable; el where se puede construir inline como en el GET actual de cultivos, añadiendo `id: cultivoId` para el endpoint de un solo cultivo.

### 5.4 Riesgos

- **Inconsistencia soft delete:** Maceta no tiene `deletedAt`. Si en el futuro se quiere “borrado lógico” de macetas, habría que añadir el campo y filtrar en todos los listados/acciones. Hoy no afecta a la autorización (se autoriza por Cultivo).
- **OPERATOR futuro:** Si más adelante se da acceso a operadores a ciertos cultivos (p. ej. tabla “membership_cultivo”), habría que introducir un scope tipo buildCultivoScopeForMembership y validar cultivoId contra esa lista; si no, un operador podría ver macetas de cualquier cultivo de la cuenta si se filtra solo por accountId.
- **Validación de cultivoId:** Si no se parsea y valida como número (y NaN → 400), podría inyectarse un valor raro; mismo riesgo que en cualquier ruta con :id. Recomendable validar igual que grupoId en Portones.
- **Datos sensibles en macetas:** La respuesta del nuevo endpoint debería limitar campos (ej. id, nombre, identificador, isActive) y no exponer datos internos de riego/sensores salvo que se definan contratos explícitos.

### 5.5 Incoherencias estructurales actuales

1. **Maceta sin deletedAt:** Account, PortonGroup, Gate y Cultivo tienen soft delete; Maceta no. Criterio de “activo” queda solo en isActive; borrado sería físico o habría que añadir deletedAt más adelante.
2. **Sin “scope reutilizable” para Cultivo en identity.telegram.service:** Portones tiene buildPortonGroupScopeForMembership y buildGateScopeForMembership; para Cultivos el where se arma en el controller. Para homogeneidad y evitar duplicación, podría existir algo como buildCultivoScopeForMembership(membership) usado por GET cultivos y por GET cultivos/:cultivoId/macetas.
3. **GET /bot/modulos/cultivos no usa service ni repository del módulo Cultivos:** La lista de cultivos se hace con prisma directo en el controller de Telegram; el módulo cultivos tiene cultivos.service.js y cultivos.repository.js con cache Redis y scope, pero el bot no los usa. No es un fallo de seguridad si el where es correcto, pero hay duplicación de lógica de scope (scope en controller vs scope en repository) y el cache del módulo no se aprovecha para el bot.
4. **Respuesta de cultivos sin isActive ni deletedAt:** El endpoint actual no devuelve isActive ni indicador de soft delete; el cliente no puede distinguir estado. Coherencia con Portones: en grupos/portones sí se devuelve nombre y datos básicos; aquí sería consistente exponer isActive si se desea.

---

## 6. Diagrama lógico de autorización (flujo)

```
[Request GET .../cultivos/:cultivoId/macetas?telegramId=X]
        │
        ▼
┌───────────────────────┐
│ authenticateBotSecret │ ── header x-bot-secret ──► 401/503 si falla
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ getTelegramIdFromRequest │ ── query.telegramId ──► 400 si vacío
└───────────┬───────────┘
            ▼
┌─────────────────────────────┐
│ resolveIdentityFromTelegramId(telegramId) │
│   → Credential TELEGRAM      │ ──► 404 si no existe / inactivo
│   → Identity + memberships ACTIVE
└───────────┬─────────────────┘
            ▼
┌───────────────────────┐
│ getMemberships(identityId) │
│   → 1 membership: activeMembership │
│   → >1: requiresAccountSelection  │ ──► 400 (selección cuenta)
└───────────┬───────────┘
            ▼
┌───────────────────────────────────────┐
│ role === OPERATOR ?                    │ ──► 403 "Sin acceso al módulo cultivos"
└───────────┬───────────────────────────┘
            ▼
┌───────────────────────────────────────┐
│ Construir cultivoWhere:                │
│   id: cultivoId (numérico)             │ ──► 400 si cultivoId inválido
│   isActive: true, deletedAt: null      │
│   + accountId si ADMIN                 │
└───────────┬───────────────────────────┘
            ▼
┌───────────────────────────────────────┐
│ prisma.cultivo.findFirst({ where })    │ ──► 404 si no existe (o sin acceso)
└───────────┬───────────────────────────┘
            ▼
┌───────────────────────────────────────┐
│ prisma.maceta.findMany({               │
│   where: { cultivoId: cultivo.id,      │
│            isActive: true }            │
│ })                                     │
└───────────┬───────────────────────────┘
            ▼
[200 { module: "cultivos", cultivo: {...}, macetas: [...] }]
```

---

## 7. Riesgos detectados (resumen)

| Riesgo | Severidad | Descripción |
|--------|-----------|-------------|
| Maceta sin soft delete | Bajo | Inconsistencia con resto de entidades; solo isActive. |
| Scope de cultivo inline en controller | Bajo | Duplicación respecto a un posible buildCultivoScopeForMembership; no centralizado. |
| Bot no usa cultivos.service/repository | Bajo | Cache y lógica del módulo no reutilizados; posible divergencia de reglas. |
| OPERATOR sin modelo de permisos por cultivo | Medio (futuro) | Si se da acceso a operadores, hay que definir scope (ej. tabla membership_cultivo) para no filtrar solo por accountId. |
| cultivoId no validado como número | Medio | Sin validación explícita, valores no numéricos podrían provocar comportamiento inesperado o errores. |

---

## 8. Recomendación arquitectónica

- **Implementar GET /api/telegram/bot/modulos/cultivos/:cultivoId/macetas** siguiendo el mismo patrón que `GET .../portones/grupos/:grupoId/portones`: mismo orden de validaciones (secret → telegramId → Identity → membership → rol → scope del recurso padre → findFirst del padre → listar hijos). Validar `cultivoId` como número y devolver 400 si no es válido.
- **Validación del cultivo:** Construir where de Cultivo según rol (SUPERADMIN vs ADMIN) con `id: cultivoId`, `isActive: true`, `deletedAt: null` y, para ADMIN, `accountId: activeMembership.accountId`. No requiere validación adicional por maceta más allá de filtrar por ese `cultivoId` (y opcionalmente isActive).
- **Opcional pero recomendable:** Extraer en identity.telegram.service una función `buildCultivoScopeForMembership(membership)` que devuelva el where de Cultivo (y en el futuro, si hay permisos por cultivo para OPERATOR, incluirlos ahí). Usarla tanto en GET /bot/modulos/cultivos como en GET .../cultivos/:cultivoId/macetas para no duplicar lógica.
- **No cambiar schema** en esta fase; solo documentar que Maceta no tiene deletedAt por si en el futuro se unifica el criterio de borrado lógico.
- **Mantener 403 para OPERATOR** en el módulo cultivos hasta que exista un modelo explícito de permisos por cultivo/maceta; así se evita que un operador vea todos los cultivos de la cuenta por defecto.

---

**Fin de la auditoría.** Sin implementación ni modificación de código; solo análisis y recomendaciones de diseño.
