/**
 * Prueba de conexión a PostgreSQL (misma config que el backend).
 * Ejecutar desde la raíz del proyecto: node testDb.js
 */

const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, ".env");
const loaded = require("dotenv").config({ path: envPath });
const pool = require("./src/db/pool");

async function main() {
  console.log("Probando conexión a la base de datos...");
  console.log("  Cargando .env desde:", envPath);

  if (loaded.error || !fs.existsSync(envPath)) {
    console.error("  ❌ No se encontró o no se pudo leer el archivo .env");
    console.error("     Ruta esperada:", envPath);
    console.error("     Ejecutá este script desde la raíz del proyecto: node testDb.js\n");
    process.exit(1);
  }

  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    console.error("  ❌ En tu .env faltan las variables de PostgreSQL.");
    console.error("     Necesitás: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT");
    console.error("     Ejemplo en .env:");
    console.error("       DB_HOST=localhost");
    console.error("       DB_USER=postgres");
    console.error("       DB_PASSWORD=tu_password");
    console.error("       DB_NAME=controlador_portones");
    console.error("       DB_PORT=5432\n");
    process.exit(1);
  }

  console.log("  Host:", process.env.DB_HOST);
  console.log("  DB:  ", process.env.DB_NAME);
  console.log("");

  try {
    const result = await pool.query("SELECT 1 AS ok");
    console.log("✅ Base de datos: conexión OK (SELECT 1 respondió)\n");

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'tenants', 'gates')
      ORDER BY table_name
    `);
    const names = tables.rows.map((r) => r.table_name);
    if (names.length === 3) {
      console.log("✅ Tablas esperadas presentes: users, tenants, gates\n");
    } else {
      console.log("⚠️  Tablas encontradas:", names.length ? names.join(", ") : "ninguna");
      console.log("   (Si faltan, creá las tablas para que el backend funcione con DB real)\n");
    }

    console.log("Prueba completada.");
  } catch (err) {
    console.error("❌ Error de base de datos:", err.message);
    if (err.code) console.error("   Código:", err.code);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
