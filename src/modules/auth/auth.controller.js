const express = require("express");
const service = require("./auth.service");

const router = express.Router();

router.post("/login/web", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: "identifier y password son requeridos" });
    }

    const result = await service.loginWeb({ identifier, password });
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

router.post("/login/telegram", async (req, res) => {
  try {
    const { telegramAuth, telegramId } = req.body || {};
    const result = await service.loginTelegram({ telegramAuth, telegramId });
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

module.exports = router;
