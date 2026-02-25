const { prisma } = require("../../infrastructure/database/prismaClient");
const { whereByScope } = require("../../shared/utils/scope");

function findAllPortones(usuarioToken) {
  return prisma.gate.findMany({
    where: whereByScope(usuarioToken),
    include: { portonGroup: true, device: true },
    orderBy: { id: "asc" },
  });
}

function findPortonById(id, usuarioToken) {
  return prisma.gate.findFirst({
    where: {
      id,
      ...whereByScope(usuarioToken),
    },
    include: { portonGroup: true, device: true },
  });
}

function createPorton(data) {
  return prisma.gate.create({ data });
}

function updatePorton(id, data, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.gate.findFirst({
      where: {
        id,
        ...whereByScope(usuarioToken),
      },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.gate.update({
      where: { id },
      data,
    });
  });
}

function deletePorton(id, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.gate.findFirst({
      where: {
        id,
        ...whereByScope(usuarioToken),
      },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.gate.delete({
      where: { id },
    });
  });
}

module.exports = {
  findAllPortones,
  findPortonById,
  createPorton,
  updatePorton,
  deletePorton,
};
