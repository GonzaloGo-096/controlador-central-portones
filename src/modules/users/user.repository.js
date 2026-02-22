/**
 * User repository. Parameterized SQL only. No business logic.
 * Authorization: users → accounts, user_gates → gates (no tenant-based resolution).
 */

const pool = require("../../infrastructure/database/pool");

/**
 * Returns rows of gates the user is explicitly authorized to use (via user_gates).
 * Only active, non-deleted accounts, users, user_gates, and gates are included.
 *
 * @param {string|number} telegramId - users.telegram_id
 * @returns {Promise<Array<{ gate_id: number, gate_name: string, identifier: string | null, topic_mqtt: string | null }>>}
 */
async function getAuthorizedGatesByTelegramId(telegramId) {
  const result = await pool.query(
    `SELECT
    g.id AS gate_id,
    g.name AS gate_name,
    g.identifier,
    g.topic_mqtt
FROM users u
JOIN accounts a ON a.id = u.account_id
JOIN user_gates ug ON ug.user_id = u.id
JOIN gates g ON g.id = ug.gate_id
WHERE u.telegram_id = $1
  AND a.is_active = true
  AND a.deleted_at IS NULL
  AND u.is_active = true
  AND u.deleted_at IS NULL
  AND ug.is_active = true
  AND ug.deleted_at IS NULL
  AND g.is_active = true
  AND g.deleted_at IS NULL`,
    [String(telegramId)]
  );
  return result.rows;
}

module.exports = {
  getAuthorizedGatesByTelegramId,
};
