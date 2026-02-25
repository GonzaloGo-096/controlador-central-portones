/**
 * Lógica de dominio Telegram. Usa Identity + memberships para autorización.
 */

const { getAuthorizedGatesForTelegramId } = require("../../modules/identity/identity.telegram.service");

/**
 * Devuelve la lista de gates autorizados para el usuario (vía Identity).
 *
 * @param {string|number} telegramId
 * @returns {Promise<Array<{ gateId: number, gateName: string, identifier?: string | null, topic_mqtt?: string | null }>>}
 */
async function getAuthorizedGates(telegramId) {
  return getAuthorizedGatesForTelegramId(telegramId);
}

module.exports = {
  getAuthorizedGates,
};
