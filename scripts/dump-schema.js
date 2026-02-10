/**
 * Muestra la estructura real de tu base (tablas y columnas).
 * Ejecutá: node scripts/dump-schema.js
 * Usa el .env del proyecto (base local o la que tengas en DATABASE_URL/DB_*).
 * Copiá la salida y pasala para adaptar schema.sql y el código.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = require("../src/db/pool");

const query = `
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`;

async function run() {
  try {
    const result = await pool.query(query);
    const byTable = {};
    for (const row of result.rows) {
      const t = row.table_name;
      if (!byTable[t]) byTable[t] = [];
      byTable[t].push(`${row.column_name} (${row.data_type})${row.is_nullable === "NO" ? " NOT NULL" : ""}`);
    }
    console.log("=== Estructura actual de tu base (public) ===\n");
    for (const [table, cols] of Object.entries(byTable).sort()) {
      console.log(table + ":");
      cols.forEach((c) => console.log("  -", c));
      console.log("");
    }
    await pool.end();
  } catch (err) {
    console.error(err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
