/**
 * PostgreSQL connection pool.
 * - Si existe DATABASE_URL (ej. Railway), se usa esa URL.
 * - Si no, se usan DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT (local).
 */

const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD != null ? String(process.env.DB_PASSWORD) : "",
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    });

// Diagnóstico al arranque: en Railway si no ves "DATABASE_URL set" la DB fallará
const dbHost = connectionString
  ? (connectionString.match(/@([^:]+):/) || [])[1] || "?"
  : process.env.DB_HOST || "(vacío)";
if (connectionString) {
  console.log("DB pool: DATABASE_URL set → host:", dbHost, "| (producción OK si es postgres.railway.internal o proxy Railway)");
} else {
  console.log("DB pool: DATABASE_URL no set → usando DB_* → host:", dbHost, "| En Railway añadí DATABASE_URL en Variables del servicio backend");
}

module.exports = pool;
