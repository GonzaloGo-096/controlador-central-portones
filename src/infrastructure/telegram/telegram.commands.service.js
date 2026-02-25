/**
 * Comandos Telegram: valida permiso (Identity) y traduce acción a evento FSM.
 */

const {
  resolveIdentityFromTelegramId,
  getMemberships,
  hasOpenAccess,
} = require("../../modules/identity/identity.telegram.service");

const VALID_ACTIONS = ["OPEN", "CLOSE", "STOP"];
const USER_EVENT = "PRESS";

/**
 * Ejecuta un comando de un usuario Telegram: valida permiso, envía PRESS a la FSM.
 *
 * @param {Object} params
 * @param {string|number} params.telegramId
 * @param {string|number} params.gateId
 * @param {string} params.action - OPEN | CLOSE | STOP
 * @param {Object} deps
 * @param {Function} deps.getStateMachine - (portonId) => StateMachine
 * @param {Function} deps.onStateChange - (portonId, result) => void
 * @returns {Promise<{ accepted: true } | { accepted: false, reason: 'FORBIDDEN' | 'INVALID_ACTION' }>}
 */
async function executeTelegramCommand({ telegramId, gateId, action }, { getStateMachine, onStateChange }) {
  const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : "";

  if (!VALID_ACTIONS.includes(normalizedAction)) {
    return { accepted: false, reason: "INVALID_ACTION" };
  }

  const resolved = await resolveIdentityFromTelegramId(telegramId);
  if (!resolved || !resolved.memberships?.length) {
    return { accepted: false, reason: "FORBIDDEN" };
  }

  const { activeMembership } = await getMemberships(resolved.identity.id);
  if (activeMembership) {
    const allowed = await hasOpenAccess(activeMembership, Number(gateId));
    if (!allowed) {
      return { accepted: false, reason: "FORBIDDEN" };
    }
  } else {
    const memberships = await require("../../modules/identity/identity.repository").getMembershipsWithScopes(
      resolved.identity.id
    );
    let allowed = false;
    for (const m of memberships) {
      if (m.status !== "ACTIVE") continue;
      if (await hasOpenAccess(m, Number(gateId))) {
        allowed = true;
        break;
      }
    }
    if (!allowed) return { accepted: false, reason: "FORBIDDEN" };
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
