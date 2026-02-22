/**
 * Lista todas las tablas de la base de datos (usa el mismo .env que el backend).
 * Ejecutar desde la raíz: node listTables.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const pool = require("./src/infrastructure/database/pool");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
  }
  const dbName = new URL(connectionString).pathname.slice(1);

  console.log("Base de datos:", dbName || "(desde DATABASE_URL)");
  console.log("Tablas en el schema public:\n");

  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (result.rows.length === 0) {
      console.log("  (ninguna tabla)");
    } else {
      result.rows.forEach((row) => console.log("  -", row.table_name));
    }
    console.log("");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
