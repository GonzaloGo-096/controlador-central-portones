/**
 * Debug de Identity por telegramId.
 * Imprime Identity, memberships, counts de groups y gates asignados.
 *
 * Uso: node scripts/debug_identity.js <telegramId>
 * Ejemplo: node scripts/debug_identity.js 1837694465
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const TELEGRAM_ID = process.argv[2] || "";

async function main() {
  if (!TELEGRAM_ID.trim()) {
    console.error("Uso: node scripts/debug_identity.js <telegramId>");
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definida");
    process.exitCode = 1;
    return;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const cred = await prisma.credential.findUnique({
      where: {
        type_identifier: { type: "TELEGRAM", identifier: String(TELEGRAM_ID).trim() },
      },
      include: {
        identity: {
          include: {
            accountMemberships: {
              include: {
                account: true,
                portonGroups: { include: { portonGroup: true } },
                gatePermissions: { include: { gate: true } },
              },
            },
          },
        },
      },
    });

    if (!cred || !cred.identity) {
      console.log("No se encontró Identity para telegramId=" + TELEGRAM_ID);
      return;
    }

    const identity = cred.identity;
    console.log("\n=== Identity ===");
    console.log("id:", identity.id);
    console.log("fullName:", identity.fullName);
    console.log("createdAt:", identity.createdAt);

    console.log("\n=== Memberships ===");
    for (const m of identity.accountMemberships) {
      console.log("- accountId:", m.accountId, "account:", m.account?.name, "role:", m.role, "status:", m.status);
    }

    let assignedGroups = 0;
    let assignedGates = 0;
    for (const m of identity.accountMemberships) {
      assignedGroups += m.portonGroups?.length ?? 0;
      assignedGates += m.gatePermissions?.length ?? 0;
    }

    console.log("\n=== Counts ===");
    console.log("Assigned porton groups:", assignedGroups);
    console.log("Assigned gates:", assignedGates);

    console.log("\n=== Detalle por membership ===");
    for (const m of identity.accountMemberships) {
      console.log("\nMembership", m.id, "| Account:", m.account?.name);
      console.log("  Groups:", (m.portonGroups || []).map((g) => g.portonGroup?.name || g.portonGroupId).join(", ") || "(ninguno)");
      console.log("  Gates:", (m.gatePermissions || []).map((gp) => gp.gate?.name || gp.gateId).join(", ") || "(ninguno)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exitCode = 1;
});
