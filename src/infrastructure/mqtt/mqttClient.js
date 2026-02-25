/**
 * Adaptador MQTT para el Controlador Central de Portones.
 *
 * Responsabilidades (según README):
 * - Conexión con broker MQTT
 * - Publicación de comandos
 * - Recepción de estados/sensores
 * - NO toma decisiones de lógica
 * - NO conoce estados (solo traduce eventos)
 */

const mqtt = require("mqtt");
const { EVENTS } = require("../../core/stateMachine");

const STATUS_TOPIC_PATTERN = "portones/+/status";
const STATUS_TOPIC_TEMPLATE = "portones/{portonId}/status";
const COMMAND_TOPIC_TEMPLATE = "portones/{portonId}/command";

const VALID_COMMANDS = ["boton_presionado"];

/**
 * Valida que el mensaje tenga la forma esperada: { event, timestamp }
 * y que event coincida con un evento válido de la FSM.
 */
function isValidStatusMessage(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.event !== "string" ||
    typeof payload.timestamp !== "string"
  ) {
    return false;
  }

  const validEvents = Object.values(EVENTS);
  return validEvents.includes(payload.event);
}

/**
 * Extrae portonId del topic "portones/{portonId}/status"
 */
function extractPortonIdFromTopic(topic) {
  const parts = topic.split("/");
  return parts.length >= 2 ? parts[1] : null;
}

/**
 * Crea e inicializa el cliente MQTT.
 *
 * @param {Object} config - { brokerUrl, username, password, clientId }
 * @param {Function} getStateMachine - (portonId) => StateMachine
 * @param {Function} onStateChange - (portonId, result) => void - callback con result = { previousState, currentState, changed }
 * @returns {Object} { connect, disconnect, publishCommand }
 */
function createMqttClient(config, getStateMachine, onStateChange) {
  let client = null;

  return {
    connect() {
      const { brokerUrl, username, password, clientId } = config;

      if (!brokerUrl) {
        throw new Error("MQTT_BROKER_URL no está configurado");
      }

      const options = {
        clientId: clientId ? `${clientId}-${process.pid}` : `controlador-${process.pid}-${Date.now()}`,
      };

      if (username) {
        options.username = username;
      }
      if (password) {
        options.password = password;
      }

      client = mqtt.connect(brokerUrl, options);

      let firstConnect = true;
      client.on("connect", () => {
        if (firstConnect) {
          console.log("📡 MQTT conectado al broker");
        }
        client.subscribe(STATUS_TOPIC_PATTERN, (err) => {
          if (err) {
            console.error("❌ Error al suscribirse a status:", err.message);
          } else if (firstConnect) {
            console.log(`📥 Suscrito a ${STATUS_TOPIC_PATTERN}`);
          }
        });

        if (config.testOnConnect && firstConnect) {
          firstConnect = false;
          const testTopic = STATUS_TOPIC_TEMPLATE.replace("{portonId}", "test");
          const testPayload = {
            event: "PRESS",
            timestamp: new Date().toISOString(),
          };
          client.publish(testTopic, JSON.stringify(testPayload), (err) => {
            if (err) {
              console.error("❌ Error al publicar test:", err.message);
            } else {
              console.log(`📤 Mensaje de prueba publicado en ${testTopic}:`, JSON.stringify(testPayload));
            }
          });
        }
      });

      client.on("error", (err) => {
        console.error("❌ Error MQTT:", err.message);
      });

      client.on("message", (topic, message) => {
        let payload;

        try {
          payload = JSON.parse(message.toString());
        } catch (e) {
          console.warn(`⚠️ Mensaje no es JSON válido en ${topic}, ignorado`);
          return;
        }

        if (!isValidStatusMessage(payload)) {
          console.warn(
            `⚠️ Formato inválido en ${topic}. Esperado: { event: string, timestamp: string }, evento debe ser uno de [${Object.values(EVENTS).join(", ")}]`
          );
          return;
        }

        const portonId = extractPortonIdFromTopic(topic);
        if (!portonId) {
          console.warn(`⚠️ No se pudo extraer portonId de ${topic}`);
          return;
        }

        const event = payload.event;
        console.log(`📩 [${portonId}] Mensaje recibido: event=${event}, timestamp=${payload.timestamp}`);

        const stateMachine = getStateMachine(portonId);
        if (stateMachine && typeof onStateChange === "function") {
          const result = stateMachine.handleEvent(event);
          onStateChange(portonId, result);
        }
      });

      return client;
    },

    disconnect() {
      if (client) {
        client.end();
        console.log("📡 MQTT desconectado");
      }
    },

    /**
     * Publica un comando en portones/{portonId}/command
     * @param {string} portonId - Identificador del portón
     * @param {string} command - "boton_presionado"
     */
    publishCommand(portonId, command) {
      if (!client || !client.connected) {
        console.warn("⚠️ MQTT no conectado, no se puede publicar comando");
        return;
      }

      if (!VALID_COMMANDS.includes(command)) {
        console.warn(
          `⚠️ Comando inválido "${command}". Debe ser boton_presionado.`
        );
        return;
      }

      const topic = COMMAND_TOPIC_TEMPLATE.replace("{portonId}", portonId);
      const payload = {
        command,
        timestamp: new Date().toISOString(),
      };

      try {
        client.publish(topic, JSON.stringify(payload), (err) => {
          if (err) {
            console.error(`❌ Error al publicar en ${topic}:`, err.message);
          } else {
            console.log(`📤 [${portonId}] Comando publicado: ${command}`);
          }
        });
      } catch (err) {
        console.error(`❌ MQTT publish throw: ${topic}`, err?.message || err);
      }
    },
  };
}

module.exports = {
  createMqttClient,
  STATUS_TOPIC_PATTERN,
  STATUS_TOPIC_TEMPLATE,
  COMMAND_TOPIC_TEMPLATE,
};
