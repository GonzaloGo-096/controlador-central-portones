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
          name: "Cuenta Familia Gomez Omil",
          isActive: true,
        },
      });

      const portonGroup = await tx.portonGroup.create({
        data: {
          accountId: account.id,
          name: "Familia - Portones",
          description: "Portones principales de la familia",
          isActive: true,
        },
      });

      const user = await tx.user.create({
        data: {
          accountId: account.id,
          fullName: "Gonzalo Gomez Omil",
          email: "gonzalo.gomezomil@gmail.com",
          role: "superadministrador",
          permissionsVersion: 1,
          isActive: true,
        },
      });

      const passwordCredential = await tx.userCredential.create({
        data: {
          userId: user.id,
          type: "PASSWORD",
          identifier: "gonzalo.gomezomil@gmail.com",
          secretHash: adminPasswordHash,
          isActive: true,
        },
      });

      const telegramCredential = await tx.userCredential.create({
        data: {
          userId: user.id,
          type: "TELEGRAM",
          identifier: "1837694465",
          secretHash: null,
          isActive: true,
        },
      });

      const userPortonGroup = await tx.userPortonGroup.create({
        data: {
          userId: user.id,
          portonGroupId: portonGroup.id,
          role: "admin",
          isActive: true,
        },
      });

      const gate = await tx.gate.create({
        data: {
          portonGroupId: portonGroup.id,
          name: "Satlta 608",
          type: "vehicular",
          identifier: "SATLTA-608",
          topicMqtt: "portones/satlta-608",
          location: "Satlta 608",
          isActive: true,
        },
      });

      const userGate = await tx.userGate.create({
        data: {
          userId: user.id,
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
          usuarioId: user.id,
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
