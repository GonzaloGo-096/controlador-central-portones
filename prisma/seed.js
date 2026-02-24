/**
 * Seed para modelo Identity + AccountMembership.
 */

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
      await tx.eventoPorton.deleteMany();
      await tx.membershipGatePermission.deleteMany();
      await tx.membershipPortonGroup.deleteMany();
      await tx.credential.deleteMany();
      await tx.accountMembership.deleteMany();
      await tx.identity.deleteMany();
      await tx.gate.deleteMany();
      // Módulo cultivos: orden por FK (hijos antes que padres)
      await tx.logSistema.deleteMany();
      await tx.adaptacion.deleteMany();
      await tx.parametrosRiego.deleteMany();
      await tx.riego.deleteMany();
      await tx.sensoresLectura.deleteMany();
      await tx.maceta.deleteMany();
      await tx.cultivo.deleteMany();
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

      const identity = await tx.identity.create({
        data: { fullName: "Gonzalo Gomez Omil" },
      });

      await tx.credential.create({
        data: {
          identityId: identity.id,
          type: "PASSWORD",
          identifier: "gonzalo.gomezomil@gmail.com",
          secretHash: adminPasswordHash,
          isActive: true,
        },
      });

      await tx.credential.create({
        data: {
          identityId: identity.id,
          type: "TELEGRAM",
          identifier: "1837694465",
          secretHash: null,
          isActive: true,
        },
      });

      const membership = await tx.accountMembership.create({
        data: {
          identityId: identity.id,
          accountId: account.id,
          role: "SUPERADMIN",
          status: "ACTIVE",
        },
      });

      await tx.membershipPortonGroup.create({
        data: {
          membershipId: membership.id,
          portonGroupId: portonGroup.id,
          roleInGroup: "admin",
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

      await tx.membershipGatePermission.create({
        data: {
          membershipId: membership.id,
          gateId: gate.id,
          permission: "open",
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

      const maceta = await tx.maceta.create({
        data: {
          cultivoId: cultivo.id,
          nombre: "Maceta 1",
          identificador: "M1",
          isActive: true,
        },
      });

      await tx.parametrosRiego.create({
        data: {
          macetaId: maceta.id,
          version: 1,
          humedadObjetivoMin: 30,
          humedadObjetivoMax: 70,
          volumenMlBase: 150,
        },
      });

      await tx.sensoresLectura.create({
        data: {
          macetaId: maceta.id,
          humedad: 45.5,
          temperatura: 22.0,
          ec: null,
        },
      });

      const ahora = new Date();
      await tx.riego.create({
        data: {
          macetaId: maceta.id,
          volumenMl: 120,
          ejecutadoAt: ahora,
        },
      });

      await tx.adaptacion.create({
        data: {
          macetaId: maceta.id,
          tipo: "recalibracion_inicial",
          parametrosAnteriores: {},
          parametrosNuevos: { humedadMin: 30, humedadMax: 70, volumenMl: 150 },
        },
      });

      await tx.logSistema.create({
        data: {
          nivel: "info",
          mensaje: "Seed módulo cultivos",
          modulo: "cultivos",
          evento: "seed",
          cultivoId: cultivo.id,
          contexto: { macetaId: maceta.id, cultivoId: cultivo.id },
        },
      });

      await tx.eventoPorton.create({
        data: {
          identityId: identity.id,
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
        identityId: identity.id,
        membershipId: membership.id,
        gateId: gate.id,
        cultivoId: cultivo.id,
        macetaId: maceta.id,
      };
    }, { timeout: 30000, maxWait: 10000 });

    console.log("SEED_OK=true");
    console.log("SEED_IDS=" + JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

runSeed().catch((err) => {
  console.error("SEED_OK=false");
  console.error("SEED_ERROR=" + err.message);
  process.exitCode = 1;
});
