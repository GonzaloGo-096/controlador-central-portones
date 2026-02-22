const { prisma } = require("../../infrastructure/database/prismaClient");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

function buildUserScope(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return {};
  return { accountId: requireAccountId(usuarioToken) };
}

function findAllUsuarios(usuarioToken) {
  return prisma.user.findMany({
    where: buildUserScope(usuarioToken),
    orderBy: { id: "asc" },
  });
}

function findUsuarioById(id, usuarioToken) {
  return prisma.user.findFirst({
    where: {
      id,
      ...buildUserScope(usuarioToken),
    },
  });
}

function createUsuario(data) {
  return prisma.user.create({ data });
}

function updateUsuario(id, data, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.user.findFirst({
      where: {
        id,
        ...buildUserScope(usuarioToken),
      },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.user.update({
      where: { id },
      data,
    });
  });
}

function deleteUsuario(id, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.user.findFirst({
      where: {
        id,
        ...buildUserScope(usuarioToken),
      },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.user.delete({
      where: { id },
    });
  });
}

module.exports = {
  findAllUsuarios,
  findUsuarioById,
  createUsuario,
  updateUsuario,
  deleteUsuario,
};
