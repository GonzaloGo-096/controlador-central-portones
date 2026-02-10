# Auditoría: acople del backend con Telegram

**Objetivo:** Verificar que el backend (“cerebro”) cumple su rol como cerebro + adaptadores HTTP y que no contiene responsabilidades que deban vivir en el bot de Telegram.

**Alcance:** Solo este repositorio (controlador-central-portones). No se audita el proyecto del bot.

**Restricción:** Análisis únicamente; no se modifica código ni se proponen refactors en este paso.

---

## 1. Resumen del estado actual

El backend está **correctamente desacoplado** de Telegram como plataforma y como proyecto:

- No existe ninguna dependencia de librerías de Telegram (Telegraf, node-telegram-bot-api, etc.).
- Los controllers y services “Telegram” solo exponen y consumen **HTTP + JSON**: validan forma, autorizan y disparan eventos en la FSM. No hay lógica de UI conversacional, botones, flujos de chat ni estados de conversación.
- El core (FSM y actionDispatcher) no conoce Telegram, HTTP ni usuarios; los side-effects siguen concentrados en el dispatcher.
- Las dependencias van en una sola dirección: HTTP → controllers → services → repositorios; el core se usa por inyección desde el entrypoint.

El uso de la palabra “Telegram” en nombres de archivos y rutas (`telegram.controller`, `telegram.command.controller`, `/api/telegram/tenants`, `/api/telegram/command`) actúa como **identificador del canal/origen** de las peticiones (el bot llama por HTTP), no como “código del bot dentro del backend”. Eso es coherente con el rol de cerebro + adaptadores.

**Conclusión:** No se detectan responsabilidades mal ubicadas. El backend cumple su rol; lo que podría haberse confundido (dónde va la lógica del bot) está bien resuelto en la implementación actual.

---

## 2. Lo que está BIEN ubicado

### 2.1 Controllers y rutas “Telegram”

| Archivo | Qué hace | Por qué está bien |
|--------|----------|--------------------|
| `api/telegram.controller.js` | GET `/api/telegram/tenants?telegram_id=...` → valida query, llama a `getTenantsWithGates`, responde 200/400/500 con JSON | Solo HTTP: validación de entrada y mapeo de resultado a status + body. No conoce botones, mensajes ni flujos. |
| `api/telegram.command.controller.js` | POST `/api/telegram/command` con body `{ telegramId, gateId, action }` → valida forma, llama a `executeTelegramCommand` con `getStateMachine` y `onStateChange` inyectados, mapea resultado a 200/400/403/500 | Solo HTTP: validación de forma y traducción resultado → status. No contiene autorización ni FSM; delega en el service con dependencias inyectadas. |

Ambos controllers:

- Solo exponen endpoints HTTP.
- No contienen lógica de UI conversacional.
- No manejan botones, textos de chat ni estados de conversación.

### 2.2 Services “Telegram”

| Archivo | Qué hace | Por qué está bien |
|--------|----------|--------------------|
| `services/telegram.service.js` | `getTenantsWithGates(telegramId)`: llama al repo, transforma filas a `[{ tenantId, tenantName, gates }]` | Sin Express, sin SQL directo, sin HTTP. Solo dominio y forma de datos. No decide mensajes ni presentación. |
| `services/telegram.commands.service.js` | `executeTelegramCommand({ telegramId, gateId, action }, { getStateMachine, onStateChange })`: valida acción, autoriza (usuario puede operar ese gate), traduce acción a evento PRESS, dispara FSM vía callbacks inyectados, devuelve `{ accepted, reason? }` | Autorización y traducción intención → evento de dominio. No conoce HTTP ni bot; recibe dependencias para no acoplar al core. |

Ninguno de los dos services:

- Toma decisiones de experiencia de usuario (qué decir, qué teclado mostrar).
- Conoce detalles del bot (callbacks, tipos de mensaje, etc.).

### 2.3 Dependencias del proyecto

- **package.json:** solo `dotenv`, `express`, `mqtt`, `pg` (y `nodemon` en dev). **No hay** Telegraf, node-telegram-bot-api ni ninguna librería de Telegram.
- No hay dependencias indirectas que introduzcan código de bot (verificado por nombres de paquetes y uso en el código).

### 2.4 Responsabilidades frente a Telegram

El backend:

- **Valida forma:** controllers comprueban presencia y tipo de `telegram_id` / `telegramId`, `gateId`, `action`.
- **Autoriza:** `telegram.commands.service` comprueba que el usuario (por `telegramId`) pueda operar el `gateId` usando datos del repositorio.
- **Dispara eventos en la FSM:** vía `getStateMachine` y `onStateChange` inyectados; el dispatcher existente aplica los side-effects (MQTT).

No decide:

- Qué texto o emoji mostrar al usuario.
- Qué botones o inline keyboards mostrar.
- Cómo reagrupar o paginar la lista de tenants/gates para el chat.
- Flujos conversacionales ni estados de sesión del chat.

### 2.5 Core y side-effects

- **FSM (`core/stateMachine.js`):** no importa Telegram, HTTP ni usuarios. Solo estados y eventos del dominio. Sigue siendo agnóstica de Telegram.
- **Dispatcher (`core/actionDispatcher.js`):** solo recibe resultado de la FSM y cliente MQTT; no conoce Telegram ni HTTP. Sigue siendo el único lugar donde se traduce cambio de estado a comando MQTT (side-effect).
- **MQTT (`mqtt/mqttClient.js`):** usa eventos de la FSM para validar mensajes entrantes; no conoce Telegram.

### 2.6 Dirección de dependencias y adaptadores

- **Entrada HTTP:** index monta routers; los routers llaman a services; los services usan repositorios (y, en comandos, callbacks inyectados). No hay flujo desde “Telegram” hacia el core: el core se inyecta desde index.
- **Core:** no importa api, services ni repositories. Los adaptadores (controllers) no contaminan el core; el core no sabe que existe “Telegram” como canal.

---

## 3. Lo que está MAL ubicado (si algo lo estuviera)

**No se identifican responsabilidades mal ubicadas** en el código actual:

- No hay handlers de bot (comandos `/start`, callbacks de botones, etc.).
- No hay construcción de mensajes, keyboards ni estados de conversación.
- No hay uso de APIs de Telegram (sendMessage, editMessageReplyMarkup, etc.).
- No hay librerías de Telegram en el backend.

Si en el futuro aparecieran en este repo cosas como:

- Uso de Telegraf o node-telegram-bot-api,
- Lógica que decida textos o botones según el “estado de conversación”,
- Envío o edición de mensajes hacia Telegram,

eso **sí** sería responsabilidad del bot y debería vivir en el otro proyecto, no aquí.

---

## 4. Dónde pudo haberse producido confusión de roles

Puntos donde es más fácil confundir “backend cerebro” con “bot de Telegram”:

1. **Nombres “telegram.*” en el backend**  
   Los archivos y rutas (`telegram.controller`, `telegram/tenants`, `telegram/command`) pueden leerse como “parte del bot”. En este proyecto significan **“API pensada para ser llamada por el bot”** (canal de entrada), no “código que corre dentro del bot”. La implementación respeta eso: solo HTTP y datos; la confusión sería solo nominal si no se aclara.

2. **Parámetro `telegramId`**  
   Es un identificador de usuario que el bot obtiene de Telegram y envía en cada request. Es correcto que viva en el backend como dato (para autorización y consultas); lo que no debe vivir aquí es la lógica de “cómo obtuve este id desde la API de Telegram” (eso es del bot).

3. **Acciones OPEN/CLOSE/STOP y razones FORBIDDEN/INVALID_ACTION**  
   Son contrato de la API HTTP, no decisiones de UX. El backend dice “rechazado por permiso” o “acción inválida”; el bot decide cómo mostrarlo (“No tenés permiso”, “Elegí una opción del menú”, etc.). Eso está bien separado.

4. **Documentación que menciona “Telegram”**  
   En `events.controller.js` y en `docs/README.md` se dice que los eventos pueden venir de “Telegram, Web, etc.”. Eso describe **quién puede llamar** al backend, no que el backend implemente Telegram. No implica mal acople; es documentación del canal.

En resumen: la posible confusión es sobre **qué significa “Telegram” en este repo** (canal de entrada vs. implementación del bot). El código no mezcla ambos; si se quiere evitar malentendidos, basta con dejar explícito en docs que “telegram” aquí = “API consumida por el bot”, no “código del bot”.

---

## 5. Recomendaciones (sin aplicar cambios)

### 5.1 Qué debe quedarse en el backend

- **Controllers** `telegram.controller.js` y `telegram.command.controller.js`: validación de request, llamada a services, mapeo resultado → status HTTP y JSON.
- **Services** `telegram.service.js` y `telegram.commands.service.js`: obtención/transformación de datos (tenants/gates), autorización usuario→gate, traducción acción humana → evento FSM, y disparo vía callbacks inyectados.
- **Repositorio** y capa DB para usuarios/tenants/gates.
- **Core** (FSM + actionDispatcher) sin referencias a Telegram ni HTTP.
- **Rutas** GET `/api/telegram/tenants` y POST `/api/telegram/command` como contrato HTTP que el bot consumirá.

Todo lo anterior es rol de “cerebro + adaptadores HTTP”.

### 5.2 Qué no debe agregarse al backend (pertenece al bot)

- Librerías de Telegram (Telegraf, node-telegram-bot-api, etc.).
- Lógica que envíe o edite mensajes en Telegram (sendMessage, editMessageText, etc.).
- Construcción de keyboards, inline buttons o menús para el chat.
- Textos, templates o traducciones de mensajes al usuario.
- Estados de conversación o flujos multi-paso del chat.
- Interpretación de `callback_query`, `message.text` o estructuras propias de la API de Telegram más allá de extraer `telegram_id` (y eventualmente gateId/action) para llamar al backend por HTTP.

Si algo de eso aparece en este repo en el futuro, debería **moverse o eliminarse** de aquí y vivir en el proyecto del bot, que es quien debe hablar con la API de Telegram y con el usuario.

### 5.3 Opcional (claridad, no corrección)

- En la documentación del repo (p. ej. README o un doc de arquitectura), dejar explícito que **“Telegram” en este proyecto** significa “API HTTP que el bot de Telegram consume”, no “implementación del bot”. Así se evita que alguien interprete que debe meter lógica de bot aquí.
- Mantener la regla: “en este repo no se importa ninguna librería de Telegram”; se puede añadir a un checklist de revisión o a la documentación de contribución.

---

## 6. Checklist de auditoría (resumen)

| Punto | Estado |
|-------|--------|
| Controllers Telegram solo exponen HTTP, sin UI conversacional | ✅ |
| Sin botones, textos de chat, flujos o estados de conversación | ✅ |
| Sin dependencias de librerías de Telegram | ✅ |
| Backend solo valida forma, autoriza y dispara FSM | ✅ |
| Sin decisiones de experiencia de usuario en el backend | ✅ |
| FSM agnóstica de Telegram | ✅ |
| Dispatcher como único lugar de side-effects (MQTT) | ✅ |
| Dependencias en una sola dirección | ✅ |
| Adaptadores no contaminan el core | ✅ |
| Responsabilidades mal ubicadas (lógica del bot en backend) | ❌ No detectadas |

**Veredicto:** El backend cumple correctamente su rol respecto a Telegram. No se requieren cambios de ubicación de responsabilidades; las recomendaciones son de claridad y prevención para el futuro.
