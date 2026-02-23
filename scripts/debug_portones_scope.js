/**
 * Debug de scope de Portones para un telegramId.
 * Imprime grupos visibles y gates visibles para el membership activo, y por qué.
 *
 * Uso: node scripts/debug_portones_scope.js <telegramId>
 * Ejemplo: node scripts/debug_portones_scope.js 1837694465
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { prisma } = require("../src/infrastructure/database/prismaClient");
const {
  resolveIdentityFromTelegramId,
  getMemberships,
  buildPortonGroupScopeForMembership,
  buildGateScopeForMembership,
} = require("../src/modules/identity/identity.telegram.service");

const TELEGRAM_ID = process.argv[2] || "";

async function main() {
  if (!TELEGRAM_ID.trim()) {
    console.error("Uso: node scripts/debug_portones_scope.js <telegramId>");
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definida");
    process.exitCode = 1;
    return;
  }

  try {
    const resolved = await resolveIdentityFromTelegramId(String(TELEGRAM_ID).trim());
    if (!resolved) {
      console.log("No se encontró Identity para telegramId=" + TELEGRAM_ID);
      return;
    }

    const { identity } = resolved;
    const { activeMembership, requiresAccountSelection } = await getMemberships(identity.id);

    if (requiresAccountSelection) {
      console.log("Usuario tiene múltiples cuentas. Selección requerida.");
      return;
    }
    if (!activeMembership) {
      console.log("Sin membership activo.");
      return;
    }

    console.log("\n=== Membership activo ===");
    console.log("accountId:", activeMembership.accountId);
    console.log("account:", activeMembership.account?.name);
    console.log("role:", activeMembership.role);

    const groupScope = buildPortonGroupScopeForMembership(activeMembership);
    console.log("\n=== Scope de grupos (buildPortonGroupScopeForMembership) ===");
    console.log(JSON.stringify(groupScope, null, 2));

    if (groupScope.id === -1) {
      console.log("\n→ Grupos visibles: NINGUNO (scope excluyente)");
      return;
    }

    const groups = await prisma.portonGroup.findMany({
      where: groupScope,
      include: { _count: { select: { gates: true } } },
      orderBy: { id: "asc" },
    });

    console.log("\n=== Grupos visibles ===");
    for (const g of groups) {
      console.log(`  - id=${g.id} name="${g.name}" gatesCount=${g._count.gates}`);
    }

    const gateScope = buildGateScopeForMembership(activeMembership);
    console.log("\n=== Scope de gates (buildGateScopeForMembership) ===");
    console.log(JSON.stringify(gateScope, null, 2));

    if (gateScope.id === -1) {
      console.log("\n→ Gates visibles: NINGUNO (scope excluyente)");
      return;
    }

    const gates = await prisma.gate.findMany({
      where: gateScope.id === -1 ? { id: -1 } : gateScope,
      include: { portonGroup: { select: { id: true, name: true } } },
      orderBy: { id: "asc" },
    });

    console.log("\n=== Gates visibles (todos) ===");
    for (const g of gates) {
      console.log(`  - id=${g.id} name="${g.name}" grupo="${g.portonGroup?.name}"`);
    }

    console.log("\n=== Por grupo (gates del grupo) ===");
    for (const grp of groups) {
      let gatesInGroup = [];
      if (gateScope.id === -1) {
        gatesInGroup = [];
      } else if (gateScope.OR) {
        const byGroup = gateScope.OR.find((o) => o.portonGroupId?.in);
        const byId = gateScope.OR.find((o) => o.id?.in);
        if (byGroup?.portonGroupId?.in?.includes(grp.id)) {
          gatesInGroup = await prisma.gate.findMany({
            where: { portonGroupId: grp.id, isActive: true, deletedAt: null },
          });
        } else if (byId?.id?.in) {
          gatesInGroup = await prisma.gate.findMany({
            where: {
              id: { in: byId.id.in },
              portonGroupId: grp.id,
              isActive: true,
              deletedAt: null,
            },
          });
        }
      } else {
        gatesInGroup = await prisma.gate.findMany({
          where: { portonGroupId: grp.id, isActive: true, deletedAt: null },
        });
      }
      console.log(`  Grupo ${grp.name} (id=${grp.id}): ${gatesInGroup.map((g) => g.name).join(", ") || "(ninguno)"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exitCode = 1;
});
