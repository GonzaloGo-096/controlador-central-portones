/**
 * Bridge MQTT. Publica "boton_presionado" al pulsar.
 * Sin FSM ni OPEN/CLOSE/STOP.
 */

const { createMqttClient } = require("./mqttClient");

const CMD_BOTON_PRESIONADO = "boton_presionado";

let mqttWrapper = null;
let rawClient = null;

function getStateMachine() {
  return null;
}
function onStateChange() {}

/**
 * Publica el único comando: botón presionado.
 * @param {string|number} portonId - id del gate
 */
function handleUserPress(portonId) {
  try {
    if (mqttWrapper?.publishCommand) {
      mqttWrapper.publishCommand(String(portonId), CMD_BOTON_PRESIONADO);
    }
  } catch (err) {
    console.error("[mqttBridge.handleUserPress] Error:", err?.message || err);
    if (err?.stack) console.error(err.stack);
  }
}

/**
 * Inicializa y conecta el cliente MQTT.
 * @param {Object} config - { brokerUrl, username, password, clientId, testOnConnect }
 * @returns {Object|null} wrapper con publishCommand o null si no hay brokerUrl
 */
function connect(config) {
  if (!config?.brokerUrl) return null;
  mqttWrapper = createMqttClient(config, getStateMachine, onStateChange);
  rawClient = mqttWrapper.connect();
  return mqttWrapper;
}

function disconnect() {
  if (mqttWrapper?.disconnect) {
    mqttWrapper.disconnect();
  }
  mqttWrapper = null;
  rawClient = null;
}

/**
 * ¿Está MQTT disponible para publicar?
 */
function isConnected() {
  return rawClient?.connected === true;
}

const bridge = {
  handleUserPress,
  connect,
  disconnect,
  isConnected,
  get mqttClient() {
    return mqttWrapper;
  },
};

module.exports = bridge;
