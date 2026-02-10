/**
 * User repository. Parameterized SQL only. No business logic.
 */

const pool = require("../db/pool");

/**
 * Returns rows: { tenant_id, tenant_name, gate_id, gate_name } (gate_id/gate_name null when tenant has no gates).
 * Returns empty array if no user or no tenants match.
 * @param {string|number} telegramId - users.telegram_id
 * @returns {Promise<Array<{ tenant_id: number, tenant_name: string, gate_id: number | null, gate_name: string | null }>>}
 */
async function getTenantsAndGatesByTelegramId(telegramId) {
  const result = await pool.query(
    `SELECT
  t.id   AS tenant_id,
  t.name AS tenant_name,
  g.id   AS gate_id,
  g.name AS gate_name
FROM users u
JOIN tenants t ON t.user_id = u.id
LEFT JOIN gates g ON g.tenant_id = t.id
WHERE u.telegram_id = $1
ORDER BY t.id, g.id`,
    [String(telegramId)]
  );
  return result.rows;
}

module.exports = {
  getTenantsAndGatesByTelegramId,
};
