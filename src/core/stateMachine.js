const STATES = {
  CLOSED: "CLOSED",
  OPENING: "OPENING",
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  STOPPED: "STOPPED",
  ERROR: "ERROR",
};

const EVENTS = {
  PRESS: "PRESS",
  SENSOR_OPEN: "SENSOR_OPEN",
  SENSOR_CLOSED: "SENSOR_CLOSED",
  ERROR_DETECTED: "ERROR_DETECTED",
  RESET: "RESET",
};

class StateMachine {
  constructor(initialState = STATES.CLOSED) {
    this.state = initialState;
  }

  handleEvent(event) {
    const previousState = this.state;

    console.log(`📥 Evento recibido: ${event}`);
    console.log(`📍 Estado actual: ${previousState}`);

    if (event === EVENTS.ERROR_DETECTED) {
      this.state = STATES.ERROR;
    } else {
      switch (this.state) {
        case STATES.CLOSED:
          if (event === EVENTS.PRESS) this.state = STATES.OPENING;
          break;

        case STATES.OPENING:
          if (event === EVENTS.SENSOR_OPEN) this.state = STATES.OPEN;
          if (event === EVENTS.PRESS) this.state = STATES.STOPPED;
          break;

        case STATES.OPEN:
          if (event === EVENTS.PRESS) this.state = STATES.CLOSING;
          break;

        case STATES.CLOSING:
          if (event === EVENTS.SENSOR_CLOSED) this.state = STATES.CLOSED;
          if (event === EVENTS.PRESS) this.state = STATES.STOPPED;
          break;

        case STATES.STOPPED:
          if (event === EVENTS.PRESS) this.state = STATES.OPENING;
          break;

        case STATES.ERROR:
          if (event === EVENTS.RESET) this.state = STATES.CLOSED;
          break;
      }
    }

    const changed = previousState !== this.state;
    console.log(`➡️ Nuevo estado: ${this.state}\n`);

    return {
      previousState,
      currentState: this.state,
      changed,
    };
  }
}

module.exports = {
  StateMachine,
  STATES,
  EVENTS,
};
