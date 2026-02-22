/**
 * Telegram domain logic. Transforms raw DB rows into clean structure. No Express, SQL, or HTTP.
 * Authorization is gate-based via user_gates; no tenant-based resolution.
 */

const { getAuthorizedGatesByTelegramId } = require("../../modules/users/user.repository");

/**
 * Returns the list of gates the user is authorized to use (from user_gates). Empty array if none.
 *
 * @param {string|number} telegramId
 * @returns {Promise<Array<{ gateId: number, gateName: string, identifier?: string | null, topic_mqtt?: string | null }>>}
 */
async function getAuthorizedGates(telegramId) {
  const rows = await getAuthorizedGatesByTelegramId(telegramId);
  return rows.map((r) => ({
    gateId: r.gate_id,
    gateName: r.gate_name,
    identifier: r.identifier ?? null,
    topic_mqtt: r.topic_mqtt ?? null,
  }));
}

module.exports = {
  getAuthorizedGates,
};
