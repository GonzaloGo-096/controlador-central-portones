# Análisis arquitectónico: integración MQTT (HyperMQ) al backend

**Alcance:** Diseño y propuesta únicamente. Sin implementación, sin modificación de archivos, sin código.

**Contexto:** Módulo Portones funcional vía Telegram; al presionar "abrir" debe publicarse un comando MQTT para una placa física. Sistema multi-tenant (accountId). Cada portón pertenece a una cuenta y se asocia a un dispositivo (device). Broker: HyperMQ.

---

## 1) Arquitectura actual del backend y dónde ubicar MQTT

### 1.1 Estado actual

- **Cliente MQTT existente:** `src/infrastructure/mqtt/mqttClient.js`.
  - Factory `createMqttClient(config, getStateMachine, onStateChange)` que devuelve `{ connect, disconnect, publishCommand }`.
  - Topics actuales: `portones/{portonId}/status` (subscribe) y `portones/{portonId}/command` (publish).
  - No está instanciado ni conectado en `index.js`; no hay llamada a `connect()` en el arranque.
  - No hay integración con `abrirPortonConDebounce` ni con el endpoint POST `/bot/portones/:id/abrir` (ambos devuelven 501 o solo registran evento).

- **Bootstrap:** `index.js` arranca Express, monta rutas, después de `listen` intenta Redis; no hay paso de “inicializar MQTT”.
- **Graceful shutdown:** Solo cierra servidor HTTP, Prisma y Redis; no hay `disconnect` MQTT.

### 1.2 Dónde debe vivir el cliente MQTT

- **Ubicación lógica:** En **infraestructura**, como recurso compartido del proceso, no dentro de un módulo de dominio (Portones/Cultivos).
- **Recomendación:** Mantener/refactorizar bajo `src/infrastructure/mqtt/` (ej. `mqttClient.js` o un `hyperMqClient.js` específico para HyperMQ). El backend actúa como **un único cliente MQTT** que publica comandos y puede suscribirse a ACK/state/telemetry.

Motivos:
- Una sola conexión TCP/TLS al broker por instancia de backend.
- Evitar abrir N conexiones (una por portón o por request).
- Centralizar configuración (URL, credenciales, clientId) y reconexión.

### 1.3 Singleton

- **Sí, debe ser singleton por proceso.** Una única instancia del cliente MQTT por proceso Node (una por pod/container en producción).
- Implementación conceptual: módulo que exporta `getMqttClient()` o que expone una instancia creada una sola vez tras la primera llamada a `connect()`. El `index.js` (o un bootstrap dedicado) llama a `connect()` una vez al arranque; el resto del código obtiene el mismo cliente inyectado o vía getter.
- Evita múltiples conexiones y múltiples clientIds desde el mismo servicio.

### 1.4 Evitar múltiples conexiones

- Crear el cliente **una sola vez** en el ciclo de vida de la aplicación.
- No crear cliente dentro de handlers HTTP ni dentro de `abrirPortonConDebounce`.
- Inyectar el cliente (o una interfaz de publicación) en el servicio de portones o en un “command publisher” que sea quien publique; el cliente físico permanece en infraestructura.

### 1.5 Dónde inicializar (bootstrap)

- **Momento:** Después de que el servidor HTTP esté escuchando (o en paralelo), y preferiblemente después de cargar configuración y opcionalmente después de Redis.
- **Lugar:** En `index.js` dentro del callback de `app.listen`, o en un script de bootstrap que reciba `app` y ejecute `await mqttClient.connect()`. Si MQTT no es obligatorio para arrancar (modo “degraded”), se puede conectar en background y loguear si falla sin tirar el proceso.
- **Orden sugerido:** 1) Express listen, 2) Redis (ya está), 3) MQTT connect. En shutdown: 1) stop accepting HTTP, 2) MQTT disconnect, 3) Redis/Prisma.

### 1.6 Reconexión

- Delegar en la librería MQTT (ej. `mqtt` npm): normalmente trae reconexión automática con backoff.
- Configurar reconexión en opciones del cliente (reconnectPeriod, etc.) y no implementar un segundo loop propio salvo necesidad específica.
- En cada evento `connect` (incluido el de reconexión), re-suscribir a los topics necesarios, porque tras reconexión las suscripciones se pierden.
- Loguear eventos `connect`, `close`, `error`, `reconnect` para operación y alertas.

### 1.7 Manejo de errores

- **Al publicar:** Si `publish` devuelve error en callback, loguear con topic, payload y error; no tirar el request HTTP (el usuario ya recibió 200; el comando se puede reintentar o quedar en cola según QoS).
- **Cliente no conectado:** Si al recibir “abrir” el cliente no está conectado, decidir: (a) responder 503 al usuario, o (b) responder 200 y loguear “comando no enviado por MQTT desconectado” y opcionalmente encolar para reintento. La opción (b) es más amigable para el usuario pero requiere estrategia de cola/reintento.
- **Errores de conexión:** No derribar el proceso; loguear y dejar que la reconexión automática actúe. Opcional: exponer un health check que indique “mqtt: disconnected” para que el orquestador sepa el estado.

---

## 2) Estrategia de topics

### 2.1 Propuesta de convención (multi-tenant, device, portón)

Estructura base sugerida:

```
iot / {accountId} / devices / {deviceId} / {category} / [{resourceId}]
```

Donde `category` es uno de: `commands`, `state`, `telemetry`, `ack`, `heartbeat`.

- **accountId:** Identificador de la cuenta (tenant). Obligatorio para aislar datos entre cuentas.
- **deviceId:** Identificador de la placa/dispositivo físico. Un device puede controlar uno o más portones (o en el futuro, macetas).
- **resourceId:** Opcional según categoría; en commands puede ser el portonId o un “slot” del device.

### 2.2 Topics concretos propuestos

| Categoría    | Dirección | Ejemplo (concreto) | Quién publica | Quién suscribe |
|-------------|-----------|--------------------|---------------|----------------|
| **commands**  | Downstream (backend → device) | `iot/1/devices/placa-001/commands` o `iot/1/devices/placa-001/commands/portones/12` | Backend | Placa |
| **state**     | Upstream (device → backend) | `iot/1/devices/placa-001/state/portones/12` | Placa | Backend |
| **telemetry** | Upstream | `iot/1/devices/placa-001/telemetry` | Placa | Backend (opcional) |
| **ack**       | Upstream | `iot/1/devices/placa-001/ack` | Placa | Backend |
| **heartbeat** | Upstream | `iot/1/devices/placa-001/heartbeat` | Placa | Backend |

Variante si un topic de commands debe distinguir el portón:

- **Opción A (topic por recurso):**  
  `iot/{accountId}/devices/{deviceId}/commands/portones/{portonId}`  
  Un mensaje por portón; el payload puede ser genérico `{ "command": "OPEN" }`.

- **Opción B (un topic de commands por device):**  
  `iot/{accountId}/devices/{deviceId}/commands`  
  El payload lleva el portonId (y en el futuro macetaId, etc.): `{ "portonId": 12, "command": "OPEN" }`.

La **Opción A** facilita permisos por topic en el broker (si HyperMQ permite ACL por patrón) y suscripciones granulares. La **Opción B** simplifica la placa (un solo topic a escuchar) y escala bien si el número de recursos por device es bajo.

### 2.3 Ventajas y desventajas

| Incluir en topic | Ventajas | Desventajas |
|------------------|----------|-------------|
| **accountId** | Aislamiento multi-tenant en el broker; ACL por cuenta; fácil particionar o auditar. | Topics más largos; hay que conocer accountId al publicar (ya lo tiene el backend). |
| **deviceId** | Un device solo escucha sus topics; escalable a muchos dispositivos; diagnóstico por dispositivo. | Hay que resolver “portón → device” (tabla o campo en Gate). |
| **portonId** (en topic o en payload) | Comandos explícitos por recurso; trazabilidad. | Si va en topic: más topics; si va en payload: un solo topic por device. |
| **Jerarquía por módulo** (ej. `.../commands/portones/12`) | Extensible a Cultivos: `.../commands/cultivos/macetas/{id}`; mismo patrón. | Convención a documentar y respetar. |

Recomendación: **Incluir accountId y deviceId en el path;** portonId puede ir en el path (Opción A) o en el payload (Opción B). Mantener una jerarquía por módulo (`portones`, `cultivos`) para preparar Cultivos.

### 2.4 Modelo de datos actual y “device”

- Hoy **Gate** tiene `topicMqtt` (string opcional) y no tiene `deviceId`. Para alinear con la propuesta hace falta un concepto de **device** (placa):
  - Opción 1: Campo `deviceId` en Gate (o en PortonGroup si una placa sirve a todo el grupo).
  - Opción 2: Tabla `Device` con relación Gate → Device (1:N o N:1 según si una placa maneja uno o varios portones).

No se implementa en este documento; solo se deja claro que la construcción del topic (o del payload) requerirá **resolver accountId y deviceId** a partir del portonId (vía Gate/PortonGroup/Account y la futura relación con Device).

---

## 3) Diseño del payload

### 3.1 Estructura JSON propuesta (comando)

```json
{
  "version": "1.0",
  "timestamp": "2025-02-24T12:00:00.000Z",
  "correlationId": "uuid-opcional",
  "origin": "telegram",
  "command": "OPEN",
  "metadata": {
    "portonId": 12,
    "identityId": "clx...",
    "accountId": 1
  }
}
```

- **version:** Cadena semántica (ej. "1.0"). Permite que la placa o el backend detecten el formato y actúen según la versión. Facilita evolución sin romper dispositivos antiguos (ej. "1.1" con un campo nuevo opcional).
- **timestamp:** ISO 8601. Orden temporal y debugging; la placa puede ignorar comandos “muy viejos” si se implementa ventana de validez.
- **correlationId:** UUID o string único por comando. Permite correlacionar el ACK con el comando en el backend (suscribirse a `ack` y matchear por correlationId).
- **origin:** `"telegram"` | `"api"` | `"system"`. Auditoría y estadísticas; la placa no tiene por qué actuar distinto.
- **command:** Acción: `OPEN`, `CLOSE`, `STOP` (portones); en Cultivos podría ser `REGAR`, `PAUSA`, etc.
- **metadata:** Datos opcionales: portonId, accountId, identityId (para logs y ACK). Si el topic ya incluye portonId, metadata puede ser redundante pero útil en el ACK.

### 3.2 Backward compatibility

- Nuevos campos en el payload deben ser **opcionales** y con valor por defecto o ignorables por la placa antigua.
- La placa puede leer `version` y si no la reconoce, rechazar o ignorar el mensaje (y opcionalmente publicar un ACK de error).
- Evitar eliminar campos; si se deprecan, mantener un tiempo y documentar.

### 3.3 Idempotencia

- Un mismo comando enviado dos veces (por reintento o doble clic) no debe producir un efecto distinto a enviarlo una vez. En portones, “OPEN” ya es idempótico (pulsar de nuevo no cambia el resultado). Para otros comandos (ej. “REGAR 50ml”) usar **correlationId** en la placa para deduplicar: si recibe el mismo correlationId dos veces, solo ejecuta una.
- El backend puede generar un correlationId único por solicitud (UUID) y guardarlo o esperar ACK con ese id para no reintentar de más.

---

## 4) QoS y Retain

### 4.1 Comandos (backend → device)

- **QoS recomendado: 1.** Al menos una vez entregado; el broker guarda hasta que el device confirme. QoS 0 puede perder el mensaje si la placa está desconectada; QoS 2 es más costoso y para “abrir portón” no suele ser necesario.
- **Retain: NO para comandos.** Retain hace que el último mensaje se guarde y se envíe a cualquier suscriptor nuevo. Un comando “OPEN” con retain haría que cada dispositivo que se conecte recibiera “OPEN” y podría abrir el portón por error. Solo usar retain en comandos si el protocolo lo exige explícitamente (no recomendado aquí).

### 4.2 Telemetry (device → backend)

- **QoS 0 o 1.** Si la telemetría es muestreo frecuente y se tolera pérdida, QoS 0; si se quiere garantía de entrega, QoS 1.
- **Retain:** Normalmente no; salvo que se quiera “último valor conocido” para nuevos suscriptores (más típico en state que en telemetry pura).

### 4.3 State

- **QoS 1** para no perder transiciones.
- **Retain: opcional SÍ** si se desea que quien se suscriba después conozca el último estado del device/portón sin esperar el próximo evento.

### 4.4 ACK y heartbeat

- **QoS 1** para ACK (el backend debe recibirlos).
- **Heartbeat:** QoS 0 o 1; retain no.

### 4.5 Resumen

| Tipo       | QoS | Retain |
|------------|-----|--------|
| commands   | 1   | No     |
| state      | 1   | Opcional (sí para “last known”) |
| telemetry  | 0 o 1 | No   |
| ack        | 1   | No     |
| heartbeat  | 0 o 1 | No   |

---

## 5) Seguridad

### 5.1 Autenticación con HyperMQ

- Asumir que HyperMQ soporta **usuario/contraseña** (MQTT estándar). Configurar en el backend variables tipo `MQTT_USERNAME`, `MQTT_PASSWORD` (o equivalentes para HyperMQ) y usarlas en las opciones del cliente. No commitear credenciales; usar secretos por entorno.
- Si HyperMQ soporta **certificados cliente (mTLS):** usar certificado por servicio/rol para autenticación fuerte y no depender solo de password. Requiere gestionar ciclo de vida de certificados.

### 5.2 Username/password

- Un único usuario para el backend (ej. `controlador-portones`) con permisos para publicar en `iot/+/devices/+/commands/...#` y suscribirse a `iot/+/devices/+/ack`, `.../state`, etc. (según ACL de HyperMQ).
- Las placas pueden tener un usuario por device o un usuario por cuenta; en cualquier caso el broker debe restringir que un device solo publique/suscriba a **su** rama (ej. `iot/1/devices/placa-001/...#`). Así se evita que un device suplante a otro.

### 5.3 Certificados

- **TLS server (broker):** Conexión `mqtts://` para cifrado en tránsito.
- **Certificados cliente (mTLS):** Si HyperMQ lo permite, el backend y cada device pueden autenticarse con certificado; reduce riesgo de robo de usuario/contraseña.

### 5.4 Riesgos actuales

- Cliente MQTT no conectado en arranque: no hay publicación real; el flujo “abrir” queda solo en evento en DB.
- Topics actuales (`portones/{id}/command`) sin accountId: en un broker compartido otro tenant podría suscribirse por error o por malicia; incluir accountId en el path mitiga.
- Credenciales en env: si el .env se filtra, un atacante podría publicar comandos; usar secretos gestionados y rotación.
- Sin ACL en broker: cualquiera con credencial podría publicar en cualquier topic; configurar ACL estricto por usuario/rol en HyperMQ.

---

## 6) Flujo completo: Telegram → Backend → MQTT → Placa → ACK → Backend

### 6.1 Diagrama textual

```
[Usuario Telegram]  →  toca "Abrir" en portón X
        │
        ▼
[Bot Telegram]  →  POST /api/telegram/bot/portones/:id/abrir  { telegramId }
        │
        ▼
[Backend - telegram.controller]
   authenticateBotSecret → resolveBotIdentityOrFail → validar permiso (hasOpenAccess / scope)
        │
        ▼
[Backend - portones.service]
   abrirPortonConDebounce(portonId, usuarioToken, canal="telegram")
   → findPortonById (scope)
   → Redis debounce (2 s)
   → createEventoPorton (auditoría)
   → [NUEVO] resolver accountId, deviceId para el portón
   → [NUEVO] construir payload (version, timestamp, correlationId, origin: "telegram", command: "OPEN", metadata)
   → [NUEVO] mqttClient.publish(topic, payload, { qos: 1 })
        │
        ▼
[HyperMQ]  →  entrega a suscriptor(es) del topic (la placa)
        │
        ▼
[Placa]  →  recibe mensaje → ejecuta OPEN (relé/actuador)
        │
        ▼
[Placa]  →  publica ACK en iot/{accountId}/devices/{deviceId}/ack
   payload: { correlationId, success: true, timestamp, ... }
        │
        ▼
[Backend]  →  suscrito a iot/+/devices/+/ack
   → recibe ACK → matchea correlationId (opcional: mapa pendientes)
   → log / actualizar estado / notificar (opcional)
   → si hay timeout sin ACK: log "no ack", alerta opcional
```

### 6.2 Cómo manejar el ACK

- El backend se suscribe a un topic (o patrón) de ACK, ej. `iot/+/devices/+/ack`.
- Cada comando enviado lleva un `correlationId` único; opcionalmente se guarda en memoria o Redis con TTL (ej. 30 s): `pendingCommands[correlationId] = { portonId, sentAt, origin }`.
- Al llegar un mensaje en el topic ACK, se parsea el payload y se busca `correlationId` en `pendingCommands`; si existe, se elimina y se loguea éxito (y opcionalmente se actualiza estado en DB o cache).
- Si no se implementa mapa de pendientes, al menos loguear todos los ACK recibidos con correlationId para trazabilidad y debugging.

### 6.3 Timeout

- Tras publicar, no bloquear la respuesta HTTP esperando ACK; la respuesta al usuario debe ser inmediata (200 “Comando enviado”).
- En background, un timer o job periódico puede revisar `pendingCommands` y marcar como “timeout” los que superen un umbral (ej. 15–30 s). Acciones: log de warning, métrica, y opcionalmente reintento (según política; cuidado con idempotencia).
- No prometer al usuario “el portón se abrió”; solo “el comando fue enviado”. El ACK indica que la placa lo recibió y ejecutó.

### 6.4 Si no hay ACK

- Log “comando sin ACK” con correlationId, portonId, deviceId.
- Opcional: reintento de publicación (una vez, con mismo correlationId para idempotencia en la placa).
- Opcional: alerta operativa si muchos comandos sin ACK (placa caída o red mala).
- No cambiar la respuesta HTTP ya enviada al usuario.

### 6.5 Logging necesario

- Al publicar: topic, correlationId, portonId, accountId, origin (info).
- Al recibir ACK: correlationId, success, deviceId (info).
- Timeout sin ACK: correlationId, portonId, deviceId (warn).
- Errores de publish: topic, error (error).
- Conexión/reconexión/desconexión MQTT (info/warn).

---

## 7) Escalabilidad

### 7.1 Múltiples dispositivos

- Cada device tiene su propio branch de topics (`iot/{accountId}/devices/{deviceId}/...`). El backend construye el topic (o el payload) según el device asociado al portón. Varias placas en paralelo no comparten topic de commands; no hay colisión.
- Un solo cliente MQTT en el backend publica a muchos topics distintos; el broker enruta por topic. Escalar dispositivos es agregar más topics/suscripciones, no más conexiones desde el backend.

### 7.2 Evitar colisiones

- **Debounce:** Ya existe por portón en Redis (2 s). Evita múltiples comandos por doble clic.
- **correlationId:** En la placa, ignorar comandos duplicados con el mismo correlationId (idempotencia).
- **Un comando por recurso:** Si se usa un topic por portón, no mezclar varios portones en un solo mensaje salvo que el protocolo lo defina; así se evitan condiciones de carrera en la placa.

### 7.3 Preparación para Cultivos

- Misma capa de infraestructura MQTT: mismo cliente singleton, misma configuración de conexión.
- Topics con jerarquía por módulo: `.../commands/portones/{id}` y en el futuro `.../commands/cultivos/macetas/{id}` (o equivalente). Payload con `command` y metadata (macetaId, volumen, etc.).
- Servicio de portones publica en su topic; un futuro servicio de cultivos (o un “command publisher” genérico) publicaría en el branch de cultivos. La placa (o gateways distintos) se suscriben a la rama que les corresponda.
- Reutilizar convención de payload (version, timestamp, correlationId, origin, command, metadata) para ambos módulos.

---

## 8) Resumen de entregables

### Diagrama de flujo (resumido)

```
Usuario → Bot → POST abrir → Backend (auth + scope)
  → abrirPortonConDebounce → EventoPorton + publish MQTT (topic con accountId, deviceId; payload con correlationId, command)
  → HyperMQ → Placa ejecuta OPEN
  → Placa publica ACK (mismo correlationId)
  → Backend (suscrito a ack) → log / pendingCommands.remove
  → Timeout job: si no ACK en 30s → log warn
```

### Propuesta concreta de topics

- **Commands (backend → device):**  
  `iot/{accountId}/devices/{deviceId}/commands/portones/{portonId}`  
  (o `iot/{accountId}/devices/{deviceId}/commands` con portonId en payload.)
- **State (device → backend):**  
  `iot/{accountId}/devices/{deviceId}/state/portones/{portonId}`
- **Telemetry:**  
  `iot/{accountId}/devices/{deviceId}/telemetry`
- **ACK:**  
  `iot/{accountId}/devices/{deviceId}/ack`
- **Heartbeat:**  
  `iot/{accountId}/devices/{deviceId}/heartbeat`

### Ejemplo real de payload (comando)

```json
{
  "version": "1.0",
  "timestamp": "2025-02-24T14:30:00.000Z",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "origin": "telegram",
  "command": "OPEN",
  "metadata": {
    "portonId": 12,
    "accountId": 1,
    "identityId": "clx..."
  }
}
```

### Estrategia de QoS

- **commands:** QoS 1, retain false.
- **state:** QoS 1, retain opcional true para “last known”.
- **telemetry:** QoS 0 o 1, retain false.
- **ack / heartbeat:** QoS 1 (ack), 0 o 1 (heartbeat), retain false.

### Estrategia de ACK

- Payload de comando incluye `correlationId` único.
- Backend mantiene (opcional) mapa de pendientes con TTL; al recibir ACK con ese correlationId, se elimina y se loguea.
- Timeout (ej. 30 s): si no llega ACK, log warn y opcional reintento o alerta.
- Respuesta HTTP al usuario inmediata, sin esperar ACK.

### Recomendación final

- **Cliente MQTT:** Singleton en infraestructura, conectado en bootstrap, desconexión en graceful shutdown; reconexión delegada en la librería; errores de publish solo logueados.
- **Topics:** Incluir accountId y deviceId en el path; convención `iot/{accountId}/devices/{deviceId}/{category}/...`; jerarquía por módulo (portones, cultivos).
- **Payload:** Versionado, timestamp, correlationId, origin, command, metadata; idempotencia en placa vía correlationId.
- **QoS/Retain:** Commands QoS 1 sin retain; ACK QoS 1; state con retain opcional.
- **Seguridad:** TLS (mqtts), usuario/contraseña desde env; ACL en HyperMQ por cuenta/device; valorar mTLS si está disponible.
- **Flujo:** No bloquear HTTP en ACK; ACK para trazabilidad y timeout; logging en publicación, recepción de ACK y timeouts.
- **Escalabilidad:** Un topic branch por device; debounce y correlationId para evitar colisiones; misma infra MQTT y convención de topics para Cultivos.

---

**Fin del informe.** No se ha implementado ni modificado código; solo análisis y propuesta de arquitectura.
