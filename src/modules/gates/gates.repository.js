const { prisma } = require("../../infrastructure/database/prismaClient");

async function findAllGates() {
  return prisma.gate.findMany({
    include: { portonGroup: true },
    orderBy: { id: "asc" },
  });
}

async function findGateById(id) {
  return prisma.gate.findUnique({
    where: { id },
    include: { portonGroup: true },
  });
}

async function createGate(data) {
  return prisma.gate.create({ data });
}

async function updateGate(id, data) {
  return prisma.gate.update({
    where: { id },
    data,
  });
}

async function deleteGate(id) {
  return prisma.gate.delete({
    where: { id },
  });
}

module.exports = {
  findAllGates,
  findGateById,
  createGate,
  updateGate,
  deleteGate,
};
