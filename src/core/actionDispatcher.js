/**
 * Dispatches MQTT commands when FSM state changes require a hardware action.
 * Stateless, synchronous. Does not contain FSM or MQTT logic itself.
 */

const { STATES } = require("./stateMachine");

const STATE_TO_COMMAND = {
  [STATES.OPENING]: "OPEN",
  [STATES.CLOSING]: "CLOSE",
  [STATES.STOPPED]: "STOP",
};

/**
 * If the FSM result indicates a state change that requires a hardware command, publish it.
 * @param {string} portonId
 * @param {{ changed: boolean, currentState: string }} fsmResult - result from StateMachine.handleEvent
 * @param {{ publishCommand: (portonId: string, command: string) => void }} mqttClient
 */
function dispatch(portonId, fsmResult, mqttClient) {
  if (!fsmResult.changed) return;

  const command = STATE_TO_COMMAND[fsmResult.currentState];
  if (command) {
    mqttClient.publishCommand(portonId, command);
  }
}

module.exports = {
  dispatch,
};
