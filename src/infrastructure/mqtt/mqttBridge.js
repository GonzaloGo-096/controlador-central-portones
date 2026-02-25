/**
 * Bridge MQTT + FSM. Centraliza el cliente MQTT, el registro de state machines
 * y la función handleUserPress para que portones.service pueda publicar comandos.
 * Se inicializa en index.js cuando MQTT_BROKER_URL está definido.
 */

const { StateMachine } = require("../../core/stateMachine");
const { createMqttClient } = require("./mqttClient");
const { dispatch } = require("../../core/actionDispatcher");

const stateMachines = new Map();

function getStateMachine(portonId) {
  const key = String(portonId);
  if (!stateMachines.has(key)) {
    stateMachines.set(key, new StateMachine());
  }
  return stateMachines.get(key);
}

function onStateChange(portonId, result) {
  if (mqttWrapper) {
    dispatch(portonId, result, mqttWrapper);
  }
}

let mqttWrapper = null;
let rawClient = null;

/**
 * Envía PRESS a la FSM del portón. Si hay cambio de estado, actionDispatcher publica el comando MQTT.
 * @param {string|number} portonId - id del gate
 */
function handleUserPress(portonId) {
  const sm = getStateMachine(portonId);
  const result = sm.handleEvent("PRESS");
  onStateChange(String(portonId), result);
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
  getStateMachine,
  handleUserPress,
  connect,
  disconnect,
  isConnected,
  get mqttClient() {
    return mqttWrapper;
  },
};

module.exports = bridge;
