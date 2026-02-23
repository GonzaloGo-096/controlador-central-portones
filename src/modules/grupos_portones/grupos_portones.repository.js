const { prisma } = require("../../infrastructure/database/prismaClient");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");
const { USER_ROLES } = require("../../shared/types/auth.types");

function scope(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return {};
  const accountId = requireAccountId(usuarioToken);
  const isOperator = usuarioToken?.role === USER_ROLES.OPERADOR;
  const mid = usuarioToken?.membershipId ?? usuarioToken?.membership_id;

  if (isOperator && mid) {
    return {
      accountId,
      membershipPortonGroups: { some: { membershipId: mid } },
    };
  }
  return { accountId };
}

function findAllGruposPortones(usuarioToken) {
  return prisma.portonGroup.findMany({
    where: scope(usuarioToken),
    include: { account: true },
    orderBy: { id: "asc" },
  });
}

function findGrupoPortonesById(id, usuarioToken) {
  return prisma.portonGroup.findFirst({
    where: { id, ...scope(usuarioToken) },
    include: { account: true },
  });
}

function createGrupoPortones(data) {
  return prisma.portonGroup.create({ data });
}

function updateGrupoPortones(id, data, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.portonGroup.findFirst({
      where: { id, ...scope(usuarioToken) },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.portonGroup.update({ where: { id }, data });
  });
}

function deleteGrupoPortones(id, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.portonGroup.findFirst({
      where: { id, ...scope(usuarioToken) },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.portonGroup.delete({ where: { id } });
  });
}

module.exports = {
  findAllGruposPortones,
  findGrupoPortonesById,
  createGrupoPortones,
  updateGrupoPortones,
  deleteGrupoPortones,
};
