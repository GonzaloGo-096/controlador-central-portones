const { prisma } = require("../../infrastructure/database/prismaClient");
const { USER_ROLES } = require("../../shared/types/auth.types");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

function whereByScope(usuarioToken) {
  const where = {};
  if (!isSuperadmin(usuarioToken)) {
    where.portonGroup = { accountId: requireAccountId(usuarioToken) };
  }
  if (usuarioToken?.role === USER_ROLES.OPERADOR) {
    where.userGates = {
      some: {
        userId: Number(usuarioToken.sub),
        isActive: true,
        deletedAt: null,
      },
    };
  }
  return where;
}

function findAllPortones(usuarioToken) {
  return prisma.gate.findMany({
    where: whereByScope(usuarioToken),
    include: { portonGroup: true },
    orderBy: { id: "asc" },
  });
}

function findPortonById(id, usuarioToken) {
  return prisma.gate.findFirst({
    where: {
      id,
      ...whereByScope(usuarioToken),
    },
    include: { portonGroup: true },
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
