/**
 * PostgreSQL connection pool.
 * - Usa exclusivamente DATABASE_URL (ej. Railway/local).
 */

const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada para PostgreSQL.");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

const dbHost = connectionString
  ? (connectionString.match(/@([^:]+):/) || [])[1] || "?"
  : "?";
console.log("DB pool: DATABASE_URL set -> host:", dbHost);

module.exports = pool;
