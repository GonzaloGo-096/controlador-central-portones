/**
 * Eventos válidos de la FSM de portones.
 * Compartido entre infrastructure/mqtt (validación) y modules/portones (FSM).
 */

const EVENTS = {
  PRESS: "PRESS",
  SENSOR_OPEN: "SENSOR_OPEN",
  SENSOR_CLOSED: "SENSOR_CLOSED",
  ERROR_DETECTED: "ERROR_DETECTED",
  RESET: "RESET",
};

module.exports = {
  EVENTS,
};
