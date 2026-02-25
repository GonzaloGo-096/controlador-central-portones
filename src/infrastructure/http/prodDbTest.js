/**
 * Endpoint temporal de diagnóstico: GET /api/_prod_db_test
 * Verifica conexión a la DB, tablas y conteos. Fácil de eliminar después.
 * Solo SELECT; usa el mismo pool que el resto del backend.
 */

const express = require("express");
const pool = require("../database/pool");

const router = express.Router();

function getHostPortFromDatabaseUrl(url) {
  if (!url || typeof url !== "string") return { host: null, port: null };
  const match = url.match(/@([^:]+):(\d+)/);
  return match ? { host: match[1], port: match[2] } : { host: null, port: null };
}

router.get("/_prod_db_test", async (req, res) => {
  const connectionString = process.env.DATABASE_URL;
  const { host, port } = getHostPortFromDatabaseUrl(connectionString);

  console.log("[_prod_db_test] Inicio — host:", host, "| port:", port, "| NODE_ENV:", process.env.NODE_ENV || "(no definido)");

  // Si piden ?schema=1, devolver estructura (tablas y columnas) en vez del test. Sirve si _prod_schema aún no está en el deploy.
  if (req.query.schema) {
    try {
      const result = await pool.query(
        `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`
      );
      const schema = {};
      for (const row of result.rows) {
        const t = row.table_name;
        if (!schema[t]) schema[t] = [];
        schema[t].push({
          column: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        });
      }
      return res.status(200).json({
        ok: true,
        host: host || "(no DATABASE_URL)",
        tables: Object.keys(schema).sort(),
        schema,
      });
    } catch (err) {
      console.error("[_prod_db_test] schema query error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  try {
    // Test 1: conexión
    const nowResult = await pool.query("SELECT NOW() AS now");
    const now = nowResult.rows[0]?.now;
    if (!now) {
      const err = new Error("SELECT NOW() no devolvió fila");
      console.error("[_prod_db_test] Error en step connection:", err.message, err.stack);
      return res.status(500).json({ ok: false, step: "connection", error: err.message });
    }

    // Test 2: listar tablas
    let tablesResult;
    try {
      tablesResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
    } catch (err) {
      console.error("[_prod_db_test] Error en step list_tables:", err.message, err.stack);
      return res.status(500).json({ ok: false, step: "list_tables", error: err.message });
    }
    const tables = tablesResult.rows.map((r) => r.table_name);

    // Test 3: conteos (solo si existen las tablas)
    const counts = {};
    const countSteps = [
      { key: "identities", step: "count_identities" },
      { key: "accounts", step: "count_accounts" },
      { key: "gates", step: "count_gates" },
    ];
    for (const { key, step } of countSteps) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*)::int AS c FROM public.${key}`);
        counts[key] = countResult.rows[0]?.c ?? 0;
      } catch (err) {
        console.error("[_prod_db_test] Error en step", step, err.message, err.stack);
        return res.status(500).json({ ok: false, step, error: err.message });
      }
    }

    const payload = {
      ok: true,
      now: typeof now === "object" && now.toISOString ? now.toISOString() : String(now),
      tables,
      counts,
    };
    console.log("[_prod_db_test] OK —", JSON.stringify(payload));
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[_prod_db_test] Error inesperado:", err.message, err.stack);
    return res.status(500).json({ ok: false, step: "connection", error: err.message });
  }
});

/**
 * GET /api/_prod_schema — contenido real de la DB (tablas y columnas).
 * Sirve para ver qué tiene la base de Railway sin conectar desde tu PC.
 */
router.get("/_prod_schema", async (req, res) => {
  const connectionString = process.env.DATABASE_URL;
  const { host, port } = getHostPortFromDatabaseUrl(connectionString);
  console.log("[_prod_schema] host:", host, "| port:", port);

  try {
    const result = await pool.query(
      `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    );
    const schema = {};
    for (const row of result.rows) {
      const t = row.table_name;
      if (!schema[t]) schema[t] = [];
      schema[t].push({
        column: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === "YES",
      });
    }
    const payload = {
      ok: true,
      host: host || "(no DATABASE_URL)",
      tables: Object.keys(schema).sort(),
      schema,
    };
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[_prod_schema] Error:", err.message, err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
