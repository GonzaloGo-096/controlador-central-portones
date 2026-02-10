/**
 * Script de prueba local: Backend Telegram + conexión con la base de datos.
 * Ejecutar con: node testBackend.js
 * Requiere el backend corriendo en BASE_URL_BACKEND (por defecto http://localhost:3000).
 */

// --- Configuración local (no requiere .env) ---
const TELEGRAM_ID = process.env.TELEGRAM_ID || "1837694465";
const BASE_URL_BACKEND = process.env.BASE_URL_BACKEND || "http://localhost:3030";
// DATABASE_URL la usa el backend; aquí solo como referencia para documentación
const DATABASE_URL = process.env.DATABASE_URL || "postgres://usuario:pass@localhost:5432/db";

async function main() {
  console.log("Iniciando prueba Backend → DB\n");

  try {
    // --- a) GET /api/telegram/tenants?telegram_id=... ---
    const tenantsUrl = `${BASE_URL_BACKEND}/api/telegram/tenants?telegram_id=${encodeURIComponent(TELEGRAM_ID)}`;
    console.log(`[1] GET tenants — telegram_id enviado: ${TELEGRAM_ID}`);
    console.log(`    URL: ${tenantsUrl}\n`);

    const tenantsRes = await fetch(tenantsUrl);

    if (!tenantsRes.ok) {
      if (tenantsRes.status === 500) {
        const body = await tenantsRes.text();
        console.error("❌ Error 500 del servidor (tenants):", body || tenantsRes.statusText);
        console.error("\n👉 El error REAL está en la terminal donde corre el backend (node src/index.js).");
        console.error("   Ahí vas a ver una línea «CAUSA DEL 500:» con el motivo.\n");
        return;
      }
      if (tenantsRes.status >= 400) {
        console.error(`❌ Respuesta inesperada: HTTP ${tenantsRes.status}`, await tenantsRes.text());
        return;
      }
    }

    const tenantsData = await tenantsRes.json();

    if (!tenantsData || typeof tenantsData.tenants === "undefined") {
      console.error("❌ Respuesta inesperada: falta propiedad 'tenants'", tenantsData);
      return;
    }

    const tenants = Array.isArray(tenantsData.tenants) ? tenantsData.tenants : [];
    console.log("Tenants recibidos:", JSON.stringify(tenants, null, 2));
    console.log("");

    // --- b) Para cada tenant: mostrar gates (vienen en la misma respuesta del backend) ---
    for (const tenant of tenants) {
      const tenantId = tenant.tenantId ?? tenant.tenant_id;
      const tenantName = tenant.tenantName ?? tenant.tenant_name ?? `Tenant ${tenantId}`;
      const gates = Array.isArray(tenant.gates) ? tenant.gates : [];

      console.log(`Gates del tenant ${tenantId} (${tenantName}):`, JSON.stringify(gates, null, 2));
      console.log("");
    }

    console.log("Prueba completada");
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED") {
      console.error("❌ Error de conexión: el backend no está corriendo en", BASE_URL_BACKEND);
      console.error("   Asegurate de ejecutar antes: node src/index.js");
    } else {
      console.error("❌ Error:", err.message);
      if (err.stack) console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
