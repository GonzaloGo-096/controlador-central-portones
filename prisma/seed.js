const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

function validateEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada para ejecutar el seed.");
  }
}

async function runSeed() {
  validateEnv();

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const adminPasswordHash = await bcrypt.hash("Admin1234!", 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Seed determinístico: limpia primera capa y vuelve a crearla.
      await tx.eventoPorton.deleteMany();
      await tx.gateEvent.deleteMany();
      await tx.userGate.deleteMany();
      await tx.userPortonGroup.deleteMany();
      await tx.userCredential.deleteMany();
      await tx.gate.deleteMany();
      await tx.cultivo.deleteMany();
      await tx.user.deleteMany();
      await tx.portonGroup.deleteMany();
      await tx.account.deleteMany();

      const account = await tx.account.create({
        data: {
          name: "Account Principal",
          isActive: true,
        },
      });

      const portonGroup = await tx.portonGroup.create({
        data: {
          accountId: account.id,
          name: "PortonGroup Central",
          description: "Unidad principal",
          isActive: true,
        },
      });

      const user = await tx.user.create({
        data: {
          accountId: account.id,
          fullName: "Superadministrador Base",
          email: "superadmin@local.test",
          role: "superadministrador",
          permissionsVersion: 1,
          isActive: true,
        },
      });

      const adminCuenta = await tx.user.create({
        data: {
          accountId: account.id,
          fullName: "Administrador Cuenta",
          email: "admin_cuenta@local.test",
          role: "administrador_cuenta",
          permissionsVersion: 1,
          isActive: true,
        },
      });

      const operador = await tx.user.create({
        data: {
          accountId: account.id,
          fullName: "Operador Demo",
          email: "operador@local.test",
          role: "operador",
          permissionsVersion: 1,
          isActive: true,
        },
      });

      const passwordCredential = await tx.userCredential.create({
        data: {
          userId: user.id,
          type: "PASSWORD",
          identifier: "superadmin@local.test",
          secretHash: adminPasswordHash,
          isActive: true,
        },
      });

      const telegramCredential = await tx.userCredential.create({
        data: {
          userId: user.id,
          type: "TELEGRAM",
          identifier: "123456789012345",
          secretHash: null,
          isActive: true,
        },
      });

      await tx.userCredential.createMany({
        data: [
          {
            userId: adminCuenta.id,
            type: "PASSWORD",
            identifier: "admin_cuenta@local.test",
            secretHash: adminPasswordHash,
            isActive: true,
          },
          {
            userId: adminCuenta.id,
            type: "TELEGRAM",
            identifier: "223456789012345",
            secretHash: null,
            isActive: true,
          },
          {
            userId: operador.id,
            type: "PASSWORD",
            identifier: "operador@local.test",
            secretHash: adminPasswordHash,
            isActive: true,
          },
          {
            userId: operador.id,
            type: "TELEGRAM",
            identifier: "323456789012345",
            secretHash: null,
            isActive: true,
          },
        ],
      });

      const userPortonGroup = await tx.userPortonGroup.create({
        data: {
          userId: adminCuenta.id,
          portonGroupId: portonGroup.id,
          role: "admin",
          isActive: true,
        },
      });

      const gate = await tx.gate.create({
        data: {
          portonGroupId: portonGroup.id,
          name: "GATE-001",
          type: "vehicular",
          identifier: "GATE-001",
          topicMqtt: "portones/gate001",
          location: "Entrada principal",
          isActive: true,
        },
      });

      const userGate = await tx.userGate.create({
        data: {
          userId: operador.id,
          gateId: gate.id,
          permission: "open",
          isActive: true,
        },
      });

      const cultivo = await tx.cultivo.create({
        data: {
          accountId: account.id,
          nombre: "Cultivo Demo",
          descripcion: "Registro inicial de cultivo",
          isActive: true,
        },
      });

      const eventoPorton = await tx.eventoPorton.create({
        data: {
          usuarioId: operador.id,
          cuentaId: account.id,
          portonId: gate.id,
          grupoPortonesId: portonGroup.id,
          accion: "abrir_press",
          canal: "seed",
        },
      });

      return {
        accountId: account.id,
        portonGroupId: portonGroup.id,
        superadminId: user.id,
        adminCuentaId: adminCuenta.id,
        operadorId: operador.id,
        passwordCredentialId: passwordCredential.id,
        telegramCredentialId: telegramCredential.id,
        userPortonGroupId: userPortonGroup.id,
        gateId: gate.id,
        userGateId: userGate.id,
        cultivoId: cultivo.id,
        eventoPortonId: eventoPorton.id,
      };
    }, { timeout: 30000, maxWait: 10000 });

    console.log("SEED_OK=true");
    console.log("SEED_IDS=" + JSON.stringify(result));
    console.log("SEED_RELATIONS_OK=true");
  } finally {
    await prisma.$disconnect();
  }
}

runSeed().catch((err) => {
  console.error("SEED_OK=false");
  console.error("SEED_ERROR=" + err.message);
  process.exitCode = 1;
});
