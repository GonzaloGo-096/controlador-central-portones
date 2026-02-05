/**
 * API HTTP para eventos del Controlador Central de Portones.
 *
 * Responsabilidades (según README):
 * - Recibe eventos externos (Telegram, Web)
 * - Valida datos
 * - Traduce solicitudes en eventos internos
 * - No contiene lógica de negocio (delega en FSM)
 */

const express = require("express");

/**
 * Crea el router de eventos HTTP.
 *
 * @param {Function} getStateMachine - (portonId) => StateMachine
 * @param {Function} onStateChange - (portonId, result) => void - callback cuando la FSM cambia
 * @returns {express.Router}
 */
function createEventsRouter(getStateMachine, onStateChange) {
  const router = express.Router();

  router.post("/events", (req, res) => {
    const body = req.body;

    console.log("📥 [HTTP] POST /api/events - Entrada:", JSON.stringify(body));

    // Validar portonId
    if (!body.portonId || typeof body.portonId !== "string") {
      console.warn("⚠️ [HTTP] Validación fallida: portonId ausente o inválido");
      res.status(400).json({
        error: "portonId es obligatorio y debe ser un string",
      });
      return;
    }

    // Validar event
    if (!body.event || typeof body.event !== "string") {
      console.warn("⚠️ [HTTP] Validación fallida: event ausente o inválido");
      res.status(400).json({
        error: "event es obligatorio y debe ser un string",
      });
      return;
    }

    const { portonId, event } = body;

    try {
      const stateMachine = getStateMachine(portonId);
      const result = stateMachine.handleEvent(event);

      if (typeof onStateChange === "function") {
        onStateChange(portonId, result);
      }

      console.log("📤 [HTTP] POST /api/events - Salida:", JSON.stringify(result));

      res.json({
        previousState: result.previousState,
        currentState: result.currentState,
        changed: result.changed,
      });
    } catch (err) {
      console.error("❌ [HTTP] Error en POST /api/events:", err.message);
      res.status(500).json({
        error: err.message || "Error interno del servidor",
      });
    }
  });

  return router;
}

module.exports = {
  createEventsRouter,
};
