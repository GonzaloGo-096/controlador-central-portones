/**
 * HTTP API for Telegram: tenants and gates by telegram_id.
 * - USE_FAKE_TENANTS=true: devuelve tenants fake sin tocar DB (debug/test).
 * - USE_FAKE_TENANTS=false o no definido: llama a la lógica de DB existente.
 */

const express = require("express");
const { getTenantsWithGates } = require("../services/telegram.service");

const router = express.Router();

const FAKE_TENANTS = [
  {
    tenantId: 1,
    tenantName: "Edificio A",
    gates: [
      { gateId: 1, gateName: "Portón Principal" },
      { gateId: 2, gateName: "Portón Secundario" },
    ],
  },
  {
    tenantId: 2,
    tenantName: "Edificio B",
    gates: [{ gateId: 3, gateName: "Portón Norte" }],
  },
];

router.get("/telegram/tenants", async (req, res) => {
  const telegramId = req.query.telegram_id;
  if (telegramId === undefined || telegramId === null || String(telegramId).trim() === "") {
    res.status(400).json({ error: "telegram_id is required" });
    return;
  }

  const useFake = process.env.USE_FAKE_TENANTS === "true";

  if (useFake) {
    console.log(`[telegram/tenants] USE_FAKE_TENANTS: respondiendo sin DB, telegram_id=${telegramId}`);
    return res.status(200).json({ tenants: FAKE_TENANTS });
  }

  try {
    const tenants = await getTenantsWithGates(telegramId);
    res.status(200).json({ tenants });
  } catch (err) {
    console.error("❌ [GET /api/telegram/tenants] Error:", err.message);
    if (err.stack) console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
