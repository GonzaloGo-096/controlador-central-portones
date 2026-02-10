/**
 * Telegram domain logic. Transforms raw DB rows into clean structure. No Express, SQL, or HTTP.
 */

const { getTenantsAndGatesByTelegramId } = require("../repositories/user.repository");

/**
 * Returns tenants with gates for the given Telegram user. Empty array if no results.
 * @param {string|number} telegramId
 * @returns {Promise<Array<{ tenantId: number, tenantName: string, gates: Array<{ gateId: number, gateName: string }> }>>}
 */
async function getTenantsWithGates(telegramId) {
  const rows = await getTenantsAndGatesByTelegramId(telegramId);
  if (rows.length === 0) return [];

  const byTenant = new Map();
  for (const row of rows) {
    const tid = row.tenant_id;
    if (!byTenant.has(tid)) {
      byTenant.set(tid, { tenantId: tid, tenantName: row.tenant_name, gates: [] });
    }
    const tenant = byTenant.get(tid);
    if (row.gate_id != null && row.gate_name != null) {
      tenant.gates.push({ gateId: row.gate_id, gateName: row.gate_name });
    }
  }
  return Array.from(byTenant.values());
}

module.exports = {
  getTenantsWithGates,
};
