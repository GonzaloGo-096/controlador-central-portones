/**
 * HTTP adapter for Telegram commands: POST /api/telegram/command.
 * Validates request shape, calls telegram.commands.service, maps result to HTTP.
 * No authorization logic, no bot details, no FSM/MQTT access.
 */

const express = require("express");
const { executeTelegramCommand } = require("../services/telegram.commands.service");

/**
 * Creates the router for POST /api/telegram/command.
 *
 * @param {Function} getStateMachine - (portonId) => StateMachine
 * @param {Function} onStateChange - (portonId, result) => void
 * @returns {express.Router}
 */
function createTelegramCommandRouter(getStateMachine, onStateChange) {
  const router = express.Router();

  router.post("/telegram/command", async (req, res) => {
    const body = req.body;

    // Validación solo de forma: campos requeridos y tipos básicos
    if (body == null || typeof body !== "object") {
      res.status(400).json({ error: "Body must be a JSON object" });
      return;
    }

    const telegramId = body.telegramId;
    if (telegramId === undefined || telegramId === null) {
      res.status(400).json({ error: "telegramId is required" });
      return;
    }
    if (typeof telegramId !== "string" && typeof telegramId !== "number") {
      res.status(400).json({ error: "telegramId must be a string or number" });
      return;
    }

    const gateId = body.gateId;
    if (gateId === undefined || gateId === null) {
      res.status(400).json({ error: "gateId is required" });
      return;
    }
    if (typeof gateId !== "string" && typeof gateId !== "number") {
      res.status(400).json({ error: "gateId must be a string or number" });
      return;
    }

    const action = body.action;
    if (action === undefined || action === null) {
      res.status(400).json({ error: "action is required" });
      return;
    }
    if (typeof action !== "string") {
      res.status(400).json({ error: "action must be a string" });
      return;
    }

    try {
      const result = await executeTelegramCommand(
        { telegramId, gateId, action },
        { getStateMachine, onStateChange }
      );

      if (result.accepted === true) {
        res.status(200).json({ accepted: true });
        return;
      }

      if (result.accepted === false && result.reason === "FORBIDDEN") {
        res.status(403).json({ accepted: false, reason: "FORBIDDEN" });
        return;
      }

      if (result.accepted === false && result.reason === "INVALID_ACTION") {
        res.status(400).json({ accepted: false, reason: "INVALID_ACTION" });
        return;
      }

      res.status(500).json({ error: "Internal server error" });
    } catch (err) {
      console.error("❌ [POST /api/telegram/command] Error:", err.message);
      if (err.stack) console.error(err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createTelegramCommandRouter,
};
