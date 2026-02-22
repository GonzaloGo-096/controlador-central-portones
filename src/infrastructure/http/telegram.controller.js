/**
 * HTTP API for Telegram: authorized gates by telegram_id.
 * - USE_FAKE_TENANTS=true: returns fake gates without DB (debug/test).
 * - Otherwise: uses getAuthorizedGates (user_gates-based, no tenant logic).
 */

const express = require("express");
const { getAuthorizedGates } = require("../telegram/telegram.service");

const router = express.Router();

const FAKE_GATES = [
  { gateId: 1, gateName: "Portón Principal", identifier: null, topic_mqtt: null },
  { gateId: 2, gateName: "Portón Secundario", identifier: null, topic_mqtt: null },
  { gateId: 3, gateName: "Portón Norte", identifier: null, topic_mqtt: null },
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
    return res.status(200).json({ gates: FAKE_GATES });
  }

  try {
    const gates = await getAuthorizedGates(telegramId);
    res.status(200).json({ gates });
  } catch (err) {
    console.error("\n❌ [GET /api/telegram/tenants] CAUSA DEL 500:", err.message);
    if (err.code) console.error("   Código:", err.code);
    if (err.stack) console.error(err.stack);
    console.error("");
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
