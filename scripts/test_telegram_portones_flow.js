/**
 * Prueba el flujo HTTP de Portones para un telegramId.
 * Llama al backend local y reporta status + body de cada endpoint.
 *
 * Uso: node scripts/test_telegram_portones_flow.js <telegramId> [baseUrl]
 * Ejemplo: node scripts/test_telegram_portones_flow.js 1837694465
 * Ejemplo: node scripts/test_telegram_portones_flow.js 1837694465 http://localhost:3000
 *
 * Requiere: .env con TELEGRAM_BOT_INTERNAL_SECRET (para auth del bot)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const TELEGRAM_ID = process.argv[2] || "1837694465"; // default: usuario seed
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.argv[3] || `http://localhost:${PORT}`).replace(/\/+$/, "");
const BOT_SECRET = process.env.TELEGRAM_BOT_INTERNAL_SECRET || "";

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(BOT_SECRET ? { "x-bot-secret": BOT_SECRET } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  if (!TELEGRAM_ID.trim()) {
    console.error("Uso: node scripts/test_telegram_portones_flow.js [telegramId] [baseUrl]");
    console.error("  telegramId: default 1837694465 (usuario seed)");
    process.exitCode = 1;
    return;
  }

  if (!BOT_SECRET) {
    console.warn("⚠ TELEGRAM_BOT_INTERNAL_SECRET no definido. El backend puede responder 401.");
  }

  const tg = encodeURIComponent(TELEGRAM_ID);

  console.log("\n=== 1. GET /api/telegram/bot/menu ===");
  const menuRes = await request("GET", `/api/telegram/bot/menu?telegramId=${tg}`);
  console.log("Status:", menuRes.status);
  console.log("Body:", JSON.stringify(menuRes.data, null, 2));

  if (!menuRes.ok) {
    console.log("\n❌ Menú falló. Abortando.");
    return;
  }

  console.log("\n=== 2. GET /api/telegram/bot/modulos/portones/grupos ===");
  const gruposRes = await request("GET", `/api/telegram/bot/modulos/portones/grupos?telegramId=${tg}`);
  console.log("Status:", gruposRes.status);
  console.log("Body:", JSON.stringify(gruposRes.data, null, 2));

  const groups = Array.isArray(gruposRes.data?.groups) ? gruposRes.data.groups : [];
  const firstGroupId = groups[0]?.id;

  if (firstGroupId !== undefined) {
    console.log("\n=== 3. GET /api/telegram/bot/modulos/portones/grupos/:grupoId/portones ===");
    const portonesRes = await request(
      "GET",
      `/api/telegram/bot/modulos/portones/grupos/${firstGroupId}/portones?telegramId=${tg}`
    );
    console.log("Status:", portonesRes.status);
    console.log("Body:", JSON.stringify(portonesRes.data, null, 2));
  } else {
    console.log("\n=== 3. (omitido: no hay grupos) ===");
  }

  console.log("\n✅ Flujo completado.");
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exitCode = 1;
});
