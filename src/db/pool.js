/**
 * PostgreSQL connection pool. Uses env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT.
 */

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
});

module.exports = pool;
