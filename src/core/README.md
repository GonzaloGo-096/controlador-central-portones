# Core

Lógica de dominio pura (sin I/O).

- **stateMachine.js**: FSM de portones. Estados: CLOSED, OPENING, OPEN, CLOSING, STOPPED, ERROR.
  Eventos: PRESS, SENSOR_OPEN, SENSOR_CLOSED, ERROR_DETECTED, RESET.

- **actionDispatcher.js**: Adaptador. Dado el resultado de `StateMachine.handleEvent`, determina si
  hay que enviar un comando (OPEN/CLOSE/STOP) y lo delega al cliente inyectado (ej. MQTT).
  No conoce MQTT; solo mapea estado → comando.
