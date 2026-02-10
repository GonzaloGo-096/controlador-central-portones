/**
 * HTTP API for Telegram: tenants and gates by telegram_id. No DB access; delegates to service.
 */

const express = require("express");
const { getTenantsWithGates } = require("../services/telegram.service");

const router = express.Router();

router.get("/telegram/tenants", async (req, res) => {
  const telegramId = req.query.telegram_id;
  if (telegramId === undefined || telegramId === null || String(telegramId).trim() === "") {
    res.status(400).json({ error: "telegram_id is required" });
    return;
  }

  try {
    const tenants = await getTenantsWithGates(telegramId);
    res.status(200).json({ tenants });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
