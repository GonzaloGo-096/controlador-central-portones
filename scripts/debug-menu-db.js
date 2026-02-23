/**
 * Debug del flujo de menú contra la DB (sin HTTP).
 * Inspecciona User, Account, Credentials, asignaciones.
 *
 * Uso: node scripts/debug-menu-db.js [telegramId]
 * Requiere: .env con DATABASE_URL
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const TELEGRAM_ID = process.argv[2] || "1837694465";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definida");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    console.log("\n=== 1. UserCredential por TELEGRAM + identifier ===");
    const cred = await prisma.userCredential.findUnique({
      where: {
        type_identifier: { type: "TELEGRAM", identifier: String(TELEGRAM_ID) },
      },
      include: { user: { include: { account: true } } },
    });

    if (!cred) {
      console.log("NO HAY credential para telegramId=" + TELEGRAM_ID);
      console.log("\nCredenciales TELEGRAM existentes:");
      const all = await prisma.userCredential.findMany({
        where: { type: "TELEGRAM" },
        include: { user: true },
      });
      console.log(JSON.stringify(all, null, 2));
      return;
    }

    console.log("Credential:", JSON.stringify(cred, null, 2));

    const user = cred.user;
    console.log("\n=== 2. User y Account ===");
    console.log("User id:", user.id, "accountId:", user.accountId, "role:", user.role, "fullName:", user.fullName);
    console.log("Account:", user.account?.name, "id:", user.account?.id);

    console.log("\n=== 3. UserPortonGroup (asignaciones a grupos) ===");
    const upg = await prisma.userPortonGroup.findMany({
      where: { userId: user.id, isActive: true, deletedAt: null },
      include: { portonGroup: true },
    });
    console.log(JSON.stringify(upg, null, 2));

    console.log("\n=== 4. UserGate (asignaciones a gates) ===");
    const ug = await prisma.userGate.findMany({
      where: { userId: user.id, isActive: true, deletedAt: null },
      include: { gate: { include: { portonGroup: true } } },
    });
    console.log(JSON.stringify(ug, null, 2));

    console.log("\n=== 5. PortonGroups del account (para buildGroupScope) ===");
    const scopeAdmin = {
      accountId: user.accountId,
      isActive: true,
      deletedAt: null,
    };
    const scopeOperador = {
      ...scopeAdmin,
      gates: {
        some: {
          isActive: true,
          deletedAt: null,
          userGates: {
            some: {
              userId: user.id,
              isActive: true,
              deletedAt: null,
            },
          },
        },
      },
    };

    const countAdmin = await prisma.portonGroup.count({ where: scopeAdmin });
    const countOperador = await prisma.portonGroup.count({ where: scopeOperador });
    const countSuperadmin = await prisma.portonGroup.count({ where: {} });

    console.log("Role del user:", user.role);
    console.log("Count con scope ADMIN (accountId):", countAdmin);
    console.log("Count con scope OPERADOR (gates con userGates):", countOperador);
    console.log("Count superadmin (sin filtro):", countSuperadmin);

    const gruposPortonesCount =
      user.role === "superadministrador" ? countSuperadmin : user.role === "administrador_cuenta" ? countAdmin : countOperador;
    console.log("\n gruposPortonesCount usado para menu:", gruposPortonesCount);
    console.log(" => Portones enabled:", gruposPortonesCount > 0);

    const cultivosCount =
      user.role === "operador"
        ? 0
        : await prisma.cultivo.count({
            where:
              user.role === "superadministrador"
                ? { isActive: true, deletedAt: null }
                : { accountId: user.accountId, isActive: true, deletedAt: null },
          });
    console.log("cultivosCount:", cultivosCount);
    console.log(" => Cultivos enabled:", user.role !== "operador" && cultivosCount > 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  console.error(err.stack);
  process.exit(1);
});
