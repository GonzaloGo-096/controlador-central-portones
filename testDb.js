/**
 * Prueba de conexión a PostgreSQL (misma config que el backend).
 * Ejecutar desde la raíz del proyecto: node testDb.js
 */

const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, ".env");
const loaded = require("dotenv").config({ path: envPath });
const pool = require("./src/infrastructure/database/pool");

async function main() {
  console.log("Probando conexión a la base de datos...");
  console.log("  Cargando .env desde:", envPath);

  if (loaded.error || !fs.existsSync(envPath)) {
    console.error("  ❌ No se encontró o no se pudo leer el archivo .env");
    console.error("     Ruta esperada:", envPath);
    console.error("     Ejecutá este script desde la raíz del proyecto: node testDb.js\n");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("  ❌ En tu .env falta DATABASE_URL.");
    console.error("     Ejemplo:");
    console.error("       DATABASE_URL=postgresql://postgres:password@localhost:5432/portones_db\n");
    process.exit(1);
  }

  const parsed = new URL(process.env.DATABASE_URL);
  console.log("  Host:", parsed.hostname);
  console.log("  DB:  ", parsed.pathname.replace("/", ""));
  console.log("");

  try {
    const result = await pool.query("SELECT 1 AS ok");
    console.log("✅ Base de datos: conexión OK (SELECT 1 respondió)\n");

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'porton_groups', 'gates')
      ORDER BY table_name
    `);
    const names = tables.rows.map((r) => r.table_name);
    if (names.length === 3) {
      console.log("✅ Tablas esperadas presentes: users, porton_groups, gates\n");
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
