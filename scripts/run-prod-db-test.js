/**
 * Misma lógica que GET /api/_prod_db_test, ejecutable por línea de comandos.
 * Uso: node scripts/run-prod-db-test.js
 * Carga .env del proyecto y usa el mismo pool (DATABASE_URL).
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = require("../src/infrastructure/database/pool");

function getHostPortFromDatabaseUrl(url) {
  if (!url || typeof url !== "string") return { host: null, port: null };
  const match = url.match(/@([^:]+):(\d+)/);
  return match ? { host: match[1], port: match[2] } : { host: null, port: null };
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
  }
  const { host, port } = getHostPortFromDatabaseUrl(connectionString);
  const dbHost = host || "(no definido)";
  const dbPort = port || "5432";

  console.log("[prod_db_test] Inicio — host:", dbHost, "| port:", dbPort, "| NODE_ENV:", process.env.NODE_ENV || "(no definido)\n");

  try {
    const nowResult = await pool.query("SELECT NOW() AS now");
    const now = nowResult.rows[0]?.now;
    if (!now) throw new Error("SELECT NOW() no devolvió fila");

    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = tablesResult.rows.map((r) => r.table_name);

    const counts = {};
    for (const key of ["users", "porton_groups", "gates"]) {
      const countResult = await pool.query(`SELECT COUNT(*)::int AS c FROM public.${key}`);
      counts[key] = countResult.rows[0]?.c ?? 0;
    }

    const result = {
      ok: true,
      now: typeof now === "object" && now.toISOString ? now.toISOString() : String(now),
      tables,
      counts,
    };
    console.log(JSON.stringify(result, null, 2));
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("[prod_db_test] Error:", err.message);
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
