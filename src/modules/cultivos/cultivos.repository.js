const { prisma } = require("../../infrastructure/database/prismaClient");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

function scope(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return {};
  return { accountId: requireAccountId(usuarioToken) };
}

function findAllCultivos(usuarioToken) {
  return prisma.cultivo.findMany({
    where: scope(usuarioToken),
    orderBy: { id: "asc" },
  });
}

function findCultivoById(id, usuarioToken) {
  return prisma.cultivo.findFirst({
    where: { id, ...scope(usuarioToken) },
  });
}

function createCultivo(data) {
  return prisma.cultivo.create({ data });
}

function updateCultivo(id, data, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.cultivo.findFirst({
      where: { id, ...scope(usuarioToken) },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.cultivo.update({
      where: { id },
      data,
    });
  });
}

function deleteCultivo(id, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.cultivo.findFirst({
      where: { id, ...scope(usuarioToken) },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.cultivo.delete({
      where: { id },
    });
  });
}

module.exports = {
  findAllCultivos,
  findCultivoById,
  createCultivo,
  updateCultivo,
  deleteCultivo,
};
