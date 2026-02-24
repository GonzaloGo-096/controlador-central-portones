# ETAPA 0: Arquitectura de Comunicación Cultivos ↔ Core

**Versión:** 1.1  
**Fecha:** 23 de febrero de 2025  
**Estado:** Propuesta de diseño

---

## 1. Resumen ejecutivo

Este documento define la arquitectura de comunicación entre el **módulo Cultivos** (autónomo en lógica de riego, fases y modelos) y el **Core** del sistema. El Core es la única fuente de verdad para identificación, autenticación, persistencia y comunicación externa (Frontend, Telegram).

---

## ⚠️ PRINCIPIO CLAVE: El módulo Cultivos se adapta al sistema existente

**No se modifica la identificación ni la arquitectura actual.** El sistema ya cuenta con:

- **Identity** + **Credential** (PASSWORD, TELEGRAM)
- **AccountMembership** (multi-cuenta por Identity)
- **Account** como tenant
- **Cultivo** (pertenece a Account)
- Scope por `accountId` en repositorios (`requireAccountId`, `scope(usuarioToken)`)
- Patrón de auditoría en **EventoPorton** (`identityId`, `cuentaId`, `portonId`, `grupoPortonesId`)

El módulo Cultivos **debe integrarse usando estos mecanismos**, sin introducir nuevos esquemas de identificación. Las entidades nuevas (Indoor, Maceta) seguirán el mismo patrón de scope y jerarquía.

---

## 2. Propuesta de estructura de comunicación

### 2.1 Principios

| Principio | Descripción |
|-----------|-------------|
| **Adaptación al sistema** | Cultivos usa la identificación existente (`identityId`, `accountId`). No inventa `userId` ni esquemas paralelos. |
| **Core como orquestador** | El Core recibe peticiones, resuelve identidades con la lógica ya existente y delega al módulo Cultivos solo la lógica de decisión. |
| **Cultivos sin dependencias externas** | Cultivos no conoce HTTP, Telegram ni MQTT. Solo procesa eventos y emite decisiones. |
| **Identificación determinística** | Cada evento lleva `identityId`, `accountId`, `indoorId`, `macetaId`, `modeloVersionId` (si aplica). El Core valida con el scope existente antes de enviar. |
| **Sin lógica frontend** | No se permite que el módulo dependa de qué cliente (web, Telegram) generó la petición. |

### 2.2 Diagrama de flujo general

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CAPA EXTERNA (Core)                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Frontend   │  │  Telegram   │  │   MQTT      │  │  Jobs / Cron (sensors)  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                │                      │                │
│         └────────────────┴────────────────┴──────────────────────┘                │
│                                          │                                         │
│                              ┌───────────▼───────────┐                             │
│                              │  API / Event Gateway  │                             │
│                              │  - Auth               │                             │
│                              │  - Resolución ids     │                             │
│                              │  - Validación scope   │                             │
│                              └───────────┬───────────┘                             │
└──────────────────────────────────────────┼─────────────────────────────────────────┘
                                           │
                         Eventos de entrada (Input Events)
                                           │
┌──────────────────────────────────────────▼─────────────────────────────────────────┐
│                         MÓDULO CULTIVOS (lógica autónoma)                           │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  - Procesa eventos normalizados                                               │  │
│  │  - Calcula decisión de riego, volumen, alertas                                │  │
│  │  - Gestiona estado por maceta (pausa, fase, versión modelo)                   │  │
│  │  - Versionado de parámetros en recalibración                                  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                          │
│                         Eventos de salida (Output Events)                            │
└──────────────────────────────────────────┼─────────────────────────────────────────┘
                                           │
┌──────────────────────────────────────────▼─────────────────────────────────────────┐
│                              CAPA CORE (persistencia / acción)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  Persistencia│  │  Ejecución   │  │  Notificac.  │  │  Auditoría           │    │
│  │  (DB/Redis)  │  │  riego       │  │  Frontend    │  │  (trazabilidad)      │    │
│  └──────────────┘  └──────────────┘  │  Telegram    │  └──────────────────────┘    │
│                                      └──────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Identificación obligatoria (mapeada al sistema existente)

Cada evento entrante y saliente debe incluir los campos que **ya existen** en el Core más los que corresponden a entidades nuevas:

| Campo en evento | Tipo | Mapeo en el sistema existente | Obligatorio |
|-----------------|------|-------------------------------|-------------|
| `identityId` | string (cuid) | `Identity.id` — JWT `sub`, usado en `EventoPorton.identityId`, `GateEvent.identityId` | Sí |
| `accountId` | number | `Account.id` — scope multi-tenant, `requireAccountId(usuarioToken)` | Sí |
| `cultivoId` | number | `Cultivo.id` — entidad existente, pertenece a Account | Sí* |
| `indoorId` | string/number | Entidad **nueva** (Indoor), pertenece a Cultivo o Account — seguir patrón de scope por accountId | Sí |
| `macetaId` | string/number | Entidad **nueva** (Maceta), pertenece a Indoor — seguir patrón de scope | Sí |
| `modeloVersionId` | string | Entidad nueva (versión de modelo) — condicional | No |

\* `cultivoId` puede ser obligatorio si Indoor pertenece a Cultivo; en ese caso el scope se valida vía `Cultivo.accountId`.

**Regla de adaptación:** El Core usa la lógica ya existente (`requireAccountId`, `buildGateWhereFromToken`-like para cultivos) para validar que `identityId` tiene acceso a `accountId`, y que `indoorId`/`macetaId` pertenecen al scope. **Cultivos nunca hace lookup de identidades**; solo recibe IDs ya validados y resueltos por el Core.

---

## 3. Esquema de eventos

### 3.1 Envelope común (todos los eventos)

```json
{
  "eventId": "evt_abc123",
  "timestamp": "2025-02-23T14:30:00.000Z",
  "context": {
    "identityId": "clu123...",
    "accountId": 1,
    "cultivoId": 1,
    "indoorId": 1,
    "macetaId": 1,
    "modeloVersionId": "ver_789..." 
  }
}
```

### 3.2 Eventos de entrada (Input → Cultivos)

| Tipo | Descripción | Payload |
|------|-------------|---------|
| `SENSOR_NORMALIZED` | Lectura de sensor (humedad, temperatura, etc.) | `{ sensorType, value, unit }` |
| `RIEGO_EJECUTADO` | Riego ya ejecutado por el Core | `{ volumeMl, executedAt }` |
| `PAUSA` | Pausa manual o automática | `{ reason, source: "manual" \| "auto" }` |
| `REANUDACION` | Reanudación del sistema | `{ recalculate: true }` |
| `CAMBIO_FASE` | Cambio de fase del cultivo | `{ faseId, anteriorFaseId }` |
| `CAMBIO_PARAMETROS_MANUAL` | Parámetros ajustados manualmente | `{ parametros: {...} }` |
| `FORZAR_RECALIBRACION` | Solicitud de recalibración | `{ motivo }` |

### 3.3 Eventos de salida (Output ← Cultivos)

| Tipo | Descripción | Payload |
|------|-------------|---------|
| `DECISION_RIEGO` | Decisión de regar o no | `{ regar: bool, motivo }` |
| `VOLUMEN_RECOMENDADO` | Volumen en ml | `{ volumeMl, metodo }` |
| `ESTADO_MACETA` | Estado actual de la maceta | `{ estado, fase, pausada }` |
| `ALERTA` | Alerta generada | `{ nivel, codigo, mensaje }` |
| `RESULTADO_RECALIBRACION` | Resultado de recalibración | `{ versionNueva, parametrosAnteriores, parametrosNuevos, diferenciasPct }` |
| `METRICA_ADAPTACION` | Efectividad de adaptación | `{ score, metrica }` |
| `VERSION_MODELO_ACTIVA` | Versión de modelo en uso | `{ modeloVersionId }` |

---

## 4. Contratos de entrada y salida

### 4.1 Contrato de entrada (Input)

**Endpoint / Canal:** Eventos entrantes al módulo Cultivos.

```typescript
interface CultivosInputEvent {
  eventId: string;
  timestamp: string;  // ISO 8601 UTC
  context: {
    identityId: string;   // Identity.id (cuid) - ya existente
    accountId: number;    // Account.id - ya existente
    cultivoId?: number;   // Cultivo.id - ya existente, si aplica
    indoorId: string | number;  // Indoor - entidad nueva
    macetaId: string | number;  // Maceta - entidad nueva
    modeloVersionId?: string;
  };
  type: 
    | "SENSOR_NORMALIZED" 
    | "RIEGO_EJECUTADO" 
    | "PAUSA" 
    | "REANUDACION" 
    | "CAMBIO_FASE" 
    | "CAMBIO_PARAMETROS_MANUAL" 
    | "FORZAR_RECALIBRACION";
  payload: Record<string, unknown>;
}

// Ejemplos de payload por tipo
interface SensorNormalizedPayload {
  sensorType: "humedad" | "temperatura" | "conductividad" | "ph" | string;
  value: number;
  unit: string;
}

interface RiegoEjecutadoPayload {
  volumeMl: number;
  executedAt: string;  // ISO 8601
}

interface PausaPayload {
  reason: string;
  source: "manual" | "auto";
}

interface CambioFasePayload {
  faseId: string;
  anteriorFaseId?: string;
}

interface ForzarRecalibracionPayload {
  motivo: string;
}
```

### 4.2 Contrato de salida (Output)

**Formato:** Objeto retornado por Cultivos. El Core decide si ejecutar, persistir o notificar.

```typescript
interface CultivosOutputEvent {
  eventId: string;
  timestamp: string;
  context: { identityId: string; accountId: number; indoorId: string | number; macetaId: string | number };
  type: 
    | "DECISION_RIEGO" 
    | "VOLUMEN_RECOMENDADO" 
    | "ESTADO_MACETA" 
    | "ALERTA" 
    | "RESULTADO_RECALIBRACION" 
    | "METRICA_ADAPTACION" 
    | "VERSION_MODELO_ACTIVA";
  payload: Record<string, unknown>;
}

interface DecisionRiegoPayload {
  regar: boolean;
  motivo: string;
}

interface VolumenRecomendadoPayload {
  volumeMl: number;
  metodo: string;
}

interface EstadoMacetaPayload {
  estado: string;
  fase: string;
  pausada: boolean;
}

interface AlertaPayload {
  nivel: "info" | "warning" | "error" | "critical";
  codigo: string;
  mensaje: string;
}

interface ResultadoRecalibracionPayload {
  versionNueva: string;
  parametrosAnteriores: Record<string, number>;
  parametrosNuevos: Record<string, number>;
  diferenciasPct: Record<string, number>;
  scoreEfectividad: number;
}
```

### 4.3 Regla de reanudación

Al recibir `REANUDACION`:
- Cultivos **debe** recalcular el estado actual (humedad, fase, modelo).
- No ejecutar riego pendiente hasta terminar el recálculo.
- Emitir `ESTADO_MACETA` actualizado antes de cualquier `DECISION_RIEGO`.

---

## 5. Seguridad y pausa

### 5.1 Estados de pausa

| Nivel | Alcance | Descripción |
|-------|---------|-------------|
| Sistema | Global | Pausa de todo el sistema (mantenimiento, emergencia). |
| Indoor | Por indoor | Pausa de todas las macetas de un indoor. |
| Maceta | Por maceta | Pausa de una maceta individual. |

### 5.2 Flujo de pausa

- **Pausa automática:** Por error de sensor, timeout, fallo de riego. Cultivos emite `ALERTA` + `PAUSA` implícita.
- **Pausa manual:** Usuario o admin solicita pausa. Core envía `PAUSA` con `source: "manual"`.
- **Reanudación:** Core envía `REANUDACION`. Cultivos recalcula y emite estado actualizado.

### 5.3 Autenticación (usa el flujo existente)

- El Core ya valida JWT (`auth.service.loginWeb`, `auth.service.loginTelegram`), secret de Telegram (`x-bot-secret`) o credencial MQTT antes de procesar.
- El token JWT incluye `sub` (identityId), `account_id`, `role`, `membershipId` (operadores).
- **Cultivos no recibe nunca raw tokens.** Solo recibe eventos con `identityId` ya resuelto por el Core usando la lógica existente.

---

## 6. Integración Frontend y Telegram

### 6.1 Flujo

```
Cultivos → Core → API → Frontend
                   └──→ Telegram (notificaciones)
```

El módulo Cultivos **no** se comunica con Telegram ni con el frontend. Expone datos suficientes para que el Core construya:

- Comparación entre versiones (antes/después de recalibración).
- Métricas de efectividad.
- Score de estabilidad.
- Motivo de recalibración.

### 6.2 Datos expuestos para UI

| Dato | Evento origen | Uso |
|------|---------------|-----|
| Parámetros anteriores vs nuevos | `RESULTADO_RECALIBRACION` | Comparación de versiones |
| Score de efectividad | `METRICA_ADAPTACION`, `RESULTADO_RECALIBRACION` | Dashboard de estabilidad |
| Motivo de recalibración | `FORZAR_RECALIBRACION` + `RESULTADO_RECALIBRACION` | Trazabilidad |
| Estado de maceta | `ESTADO_MACETA` | Indicadores en tiempo real |

---

## 7. Versionado obligatorio

### 7.1 Reglas

- Cada recalibración genera una **nueva versión** del modelo/parámetros.
- No se permite sobreescritura silenciosa de parámetros.
- Toda recalibración debe emitir `RESULTADO_RECALIBRACION` con:
  - `versionNueva`
  - `parametrosAnteriores`
  - `parametrosNuevos`
  - `diferenciasPct`
  - `scoreEfectividad`

### 7.2 Auditoría

Cada decisión de riego debe poder trazarse a:

- Métricas usadas (humedad, fase, etc.).
- Versión activa del modelo (`modeloVersionId`).
- Estado del sistema (pausado o no).
- Datos base utilizados (lecturas de sensor, fechas).

---

## 8. Recomendación de arquitectura

### 8.1 Opción recomendada: Event-driven + Message bus interno

| Criterio | Recomendación |
|----------|---------------|
| **Patrón** | Event-driven con bus de eventos interno (in-process o Redis Streams). |
| **Razón** | Desacoplamiento, trazabilidad, re-intentos, y alineación con el flujo MQTT ya existente en el proyecto. |

### 8.2 Comparativa rápida

| Opción | Pros | Contras |
|--------|------|---------|
| **REST síncrono** | Simple, fácil de debuguear | Acoplamiento, Core debe esperar respuesta, menos escalable. |
| **Event-driven in-process** | Bajo latency, sin infra extra | Todo en un proceso; si cae, cae todo. |
| **Redis Streams / message bus** | Persistencia, reintentos, escalabilidad | Infra adicional, complejidad operativa. |
| **MQTT (como ya usan)** | Ya existe en el proyecto | Menos adecuado para request/response estructurado. |

### 8.3 Propuesta concreta

1. **Core → Cultivos:** Cola de eventos (Redis Streams o BullMQ) con eventos de entrada.
2. **Cultivos → Core:** Emisión de eventos de salida a otra cola o callback registrado.
3. **Identificación:** El Core inyecta `identityId`, `accountId`, `indoorId`, `macetaId` usando el scope existente (`requireAccountId`, validación de ownership) antes de encolar.
4. **Persistencia:** El Core consume eventos de salida, persiste en DB (siguiendo el patrón de `EventoPorton` si aplica) y decide ejecución de riego/notificación.

```
[API/MQTT] → validar auth → resolver IDs → publicar en stream "cultivos:input"
                                                      │
                                                      ▼
[Worker Cultivos] ← consume "cultivos:input" → procesa → publica "cultivos:output"
                                                              │
                                                              ▼
[Worker Core] ← consume "cultivos:output" → persistir / ejecutar riego / notificar
```

### 8.4 Alternativa más simple (MVP)

Para una primera versión:

- **Llamada directa in-process:** El Core llama a `cultivosModule.processEvent(event)` y recibe el resultado síncronamente.
- Mismo contrato de eventos.
- Sin colas. Migración futura a event-driven sin cambiar contratos.

---

## 9. Posibles riesgos

| Riesgo | Mitigación |
|--------|------------|
| **Romper la identificación existente** | Usar siempre `identityId` y `accountId`; no introducir `userId` ni esquemas paralelos. Seguir la sección 10 (Instrucciones de adaptación). |
| **Inconsistencia de IDs** | Core siempre resuelve IDs con la lógica existente antes de enviar. Cultivos nunca hace lookup. Validación de scope con `requireAccountId` y ownership. |
| **Cultivos acoplado a frontend** | Contrato estricto; no pasar datos de sesión ni de cliente. |
| **Ejecución directa de hardware** | Cultivos solo emite decisiones. Core ejecuta comandos de riego. |
| **Sobreescritura silenciosa** | Versionado obligatorio; toda recalibración genera nueva versión y evento. |
| **Pérdida de trazabilidad** | `eventId` en todos los eventos; persistir en tabla de auditoría alineada con el patrón de `EventoPorton`. |
| **Pausa ignorada** | Cultivos verifica estado de pausa antes de emitir `DECISION_RIEGO`. |
| **Reanudación sin recálculo** | Contrato explícito: `REANUDACION` implica recálculo antes de acciones. |
| **Latencia en colas** | Timeouts y métricas; alertas si la cola se retrasa. |

---

## 10. Instrucciones para el módulo Cultivos: adaptarse al software existente

El módulo Cultivos **debe integrarse sin romper** la identificación ni la arquitectura actual. A continuación, las instrucciones explícitas.

### 10.1 Qué usar (no inventar)

| Concepto | Usar del sistema existente | No hacer |
|----------|----------------------------|----------|
| Usuario/actor | `identityId` (Identity.id, cuid) | No crear `userId`, `user_id` ni esquemas paralelos |
| Cuenta/tenant | `accountId` (Account.id, int) | No crear tenant id propio |
| Scope de datos | `requireAccountId(usuarioToken)`, `scope(usuarioToken)` ya en `cultivos.repository.js` | No crear lógica de scope nueva |
| Autenticación | JWT con `sub`, `account_id`, `role`; Telegram con `resolveTokenUserFromTelegramId` | No recibir tokens en Cultivos |
| Jerarquía CRUD | Cultivo pertenece a Account; seguir patrón de `cultivos.repository` | No cambiar el modelo Cultivo existente sin migración planificada |
| Auditoría | Patrón de `EventoPorton` (identityId, cuentaId, ...) | No inventar tablas de auditoría sin alinear con el patrón |

### 10.2 Qué extender (sin romper)

- **Indoor, Maceta:** Agregar como entidades nuevas con `accountId` o `cultivoId` en el schema, siguiendo el patrón de `PortonGroup` → `Gate` (scope por account).
- **Eventos de cultivos:** Crear tabla tipo `EventoCultivo` con `identityId`, `accountId`, etc., alineada con `EventoPorton`.
- **Repositorios:** Reutilizar `requireAccountId`, `isSuperadmin`, `scope()` de `scope.js` y el patrón de `cultivos.repository.js`.

### 10.3 Integración con el Core

- Los endpoints de la API que invoquen Cultivos deben usar el mismo middleware de auth (`requireAuth`, `requireGateAccess`-like para cultivos).
- El controller resuelve `identityId` desde `req.user.sub`, `accountId` desde `req.user.account_id`, y valida que `indoorId`/`macetaId` pertenezcan al account antes de llamar al módulo.
- El módulo Cultivos recibe el evento con `context` ya poblado; no accede a `req`, `res` ni a la base de datos para resolver identidades.

### 10.4 Resumen de adaptación

> **El módulo Cultivos se adapta al software existente.** No introduce nuevos esquemas de identificación, reutiliza Identity/Account/Credential, sigue el patrón de scope por accountId, y extiende el dominio con Indoor/Maceta respetando la jerarquía y la auditoría ya definidas.

---

## 11. Próximos pasos sugeridos

1. Extender el schema de Prisma con `Indoor`, `Maceta`, `ModeloVersion` — **sin modificar** Identity, Account, Credential, Cultivo existentes.
2. Crear `EventoCultivo` siguiendo el patrón de `EventoPorton` (identityId, cuentaId, ...).
3. Implementar el contrato de entrada/salida con `identityId` y `accountId`.
4. Crear el módulo Cultivos como paquete/carpeta que reciba eventos con context ya resuelto.
5. Integrar en el Core: usar `requireAccountId`, validar scope de indoor/maceta, encolar o invocar.
6. Conectar salida con ejecución de riego y notificaciones (Frontend/Telegram) usando los canales ya existentes.

---

*Documento generado como propuesta de arquitectura para la Etapa 0 del módulo Cultivos. El módulo debe adaptarse al sistema existente sin romper la identificación ni la arquitectura actual.*
