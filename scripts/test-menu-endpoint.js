/**
 * Script para reproducir el fallo del menú de módulos.
 * Uso: node scripts/test-menu-endpoint.js [telegramId]
 *
 * Requiere: .env con DATABASE_URL, TELEGRAM_BOT_INTERNAL_SECRET
 * Ejemplo: node scripts/test-menu-endpoint.js 1837694465
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.BACKEND_URL || process.env.CONTROLADOR_BASE_URL || "http://localhost:3000";
const SECRET = process.env.TELEGRAM_BOT_INTERNAL_SECRET || "";
const TELEGRAM_ID = process.argv[2] || "1837694465";

async function testMenuEndpoint() {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/telegram/bot/menu?telegramId=${encodeURIComponent(TELEGRAM_ID)}`;
  console.log("\n=== Test GET /api/telegram/bot/menu ===");
  console.log("URL:", url);
  console.log("telegramId:", TELEGRAM_ID);
  console.log("x-bot-secret:", SECRET ? `${SECRET.slice(0, 4)}...` : "(vacío)");
  console.log("");

  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["x-bot-secret"] = SECRET;

  try {
    const res = await fetch(url, { method: "GET", headers });
    const body = await res.text();
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      json = { raw: body };
    }

    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(json, null, 2));

    if (res.status === 200 && json.modules) {
      const portonesEnabled = json.modules.find((m) => m.key === "portones")?.enabled ?? false;
      const cultivosEnabled = json.modules.find((m) => m.key === "cultivos")?.enabled ?? false;
      console.log("\nMódulos habilitados: Portones=" + portonesEnabled + ", Cultivos=" + cultivosEnabled);
    }
  } catch (err) {
    console.error("Error:", err.message);
    if (err.cause) console.error("Cause:", err.cause);
    if (err.stack) console.error(err.stack);
  }
}

testMenuEndpoint();
