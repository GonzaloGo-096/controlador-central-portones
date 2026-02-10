/**
 * Telegram commands: authorize user→gate and translate human action into FSM event.
 * No HTTP, no bot details. Uses existing repo; receives getStateMachine + onStateChange by injection.
 */

const { getTenantsAndGatesByTelegramId } = require("../repositories/user.repository");

const VALID_ACTIONS = ["OPEN", "CLOSE", "STOP"];
const USER_EVENT = "PRESS";

/**
 * Executes a command from a Telegram user: validates permission, sends one PRESS to the FSM.
 *
 * @param {Object} params
 * @param {string|number} params.telegramId
 * @param {string|number} params.gateId - gate the user wants to operate (used as portonId for FSM)
 * @param {string} params.action - OPEN | CLOSE | STOP (user intent; FSM receives PRESS)
 * @param {Object} deps - injected so this module does not depend on core or index
 * @param {Function} deps.getStateMachine - (portonId) => StateMachine
 * @param {Function} deps.onStateChange - (portonId, result) => void
 * @returns {Promise<{ accepted: true } | { accepted: false, reason: 'FORBIDDEN' | 'INVALID_ACTION' }>}
 */
async function executeTelegramCommand({ telegramId, gateId, action }, { getStateMachine, onStateChange }) {
  const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : "";

  if (!VALID_ACTIONS.includes(normalizedAction)) {
    return { accepted: false, reason: "INVALID_ACTION" };
  }

  const rows = await getTenantsAndGatesByTelegramId(telegramId);
  const allowedGateIds = new Set(rows.map((r) => r.gate_id).filter((id) => id != null));

  const gateIdNum = Number(gateId);
  if (Number.isNaN(gateIdNum) || !allowedGateIds.has(gateIdNum)) {
    return { accepted: false, reason: "FORBIDDEN" };
  }

  const portonId = String(gateId);
  const stateMachine = getStateMachine(portonId);
  const result = stateMachine.handleEvent(USER_EVENT);

  if (typeof onStateChange === "function") {
    onStateChange(portonId, result);
  }

  return { accepted: true };
}

module.exports = {
  executeTelegramCommand,
};
