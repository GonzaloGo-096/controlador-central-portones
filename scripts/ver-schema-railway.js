/**
 * Ver el schema (tablas y columnas) de la base de Railway.
 * El backend en Railway debe estar desplegado y tener GET /api/_prod_schema.
 *
 * Ejecutá (reemplazá la URL por la de tu backend en Railway):
 *
 *   node scripts/ver-schema-railway.js
 *
 * O con la URL por variable de entorno:
 *
 *   set BASE_URL=https://tu-app.up.railway.app
 *   node scripts/ver-schema-railway.js
 */

const baseUrl = process.env.BASE_URL || "https://controlador-central-portones-production.up.railway.app";

async function main() {
  const url = `${baseUrl.replace(/\/$/, "")}/api/_prod_schema`;
  console.log("GET", url, "\n");
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      console.error("Error", res.status, data);
      process.exit(1);
    }
    console.log("Host DB:", data.host);
    console.log("Tablas:", data.tables?.join(", ") || "(ninguna)\n");
    if (data.schema) {
      for (const [table, cols] of Object.entries(data.schema).sort()) {
        console.log(table + ":");
        cols.forEach((c) => console.log("  -", c.column, "(" + c.type + ")", c.nullable ? "nullable" : "NOT NULL"));
        console.log("");
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
    console.error("\nRevisá que BASE_URL sea la URL de tu backend en Railway.");
    console.error("Ejemplo: set BASE_URL=https://tu-proyecto.up.railway.app");
    process.exit(1);
  }
}

main();
