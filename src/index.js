/**
 * Punto de arranque del Controlador Central de Portones.
 *
 * Responsabilidades (según README):
 * - Inicializa módulos
 * - Orquesta dependencias
 * - Sin imports circulares: FSM no conoce MQTT, MQTT recibe FSM por inyección
 */

const { StateMachine, STATES } = require("./core/stateMachine");
const { createMqttClient } = require("./mqtt/mqttClient");
const { mqtt: mqttConfig } = require("./config/env");

console.log("🚀 Controlador Central de Portones iniciado");

// Registro de FSM por portón (un estado lógico por portonId)
const stateMachineRegistry = new Map();

function getStateMachine(portonId) {
  if (!stateMachineRegistry.has(portonId)) {
    stateMachineRegistry.set(portonId, new StateMachine(STATES.CLOSED));
    console.log(`📍 [${portonId}] FSM creada, estado inicial: CLOSED`);
  }
  return stateMachineRegistry.get(portonId);
}

// Mapa estado → comando MQTT (solo estados que requieren acción en hardware)
const STATE_TO_COMMAND = {
  [STATES.OPENING]: "OPEN",
  [STATES.CLOSING]: "CLOSE",
  [STATES.STOPPED]: "STOP",
};

const mqttClient = createMqttClient(
  mqttConfig,
  getStateMachine,
  (portonId, result) => {
    if (!result.changed) return;

    const command = STATE_TO_COMMAND[result.currentState];
    if (command) {
      mqttClient.publishCommand(portonId, command);
    }
  }
);

mqttClient.connect();
