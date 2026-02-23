/**
 * Usuarios = AccountMemberships con Identity (modelo nuevo).
 */

const { prisma } = require("../../infrastructure/database/prismaClient");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

function buildScope(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return {};
  return { accountId: requireAccountId(usuarioToken) };
}

function findAllUsuarios(usuarioToken) {
  return prisma.accountMembership.findMany({
    where: { ...buildScope(usuarioToken), status: "ACTIVE" },
    include: {
      identity: {
        include: {
          credentials: { where: { isActive: true }, select: { type: true, identifier: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

function findUsuarioById(id, usuarioToken) {
  return prisma.accountMembership.findFirst({
    where: {
      id: Number(id),
      ...buildScope(usuarioToken),
    },
    include: {
      identity: {
        include: {
          credentials: { where: { isActive: true }, select: { type: true, identifier: true } },
        },
      },
    },
  });
}

const ROLE_MAP = { superadministrador: "SUPERADMIN", administrador_cuenta: "ADMIN", operador: "OPERATOR" };

async function createUsuario(data, usuarioToken) {
  const scope = buildScope(usuarioToken);
  const accountId = scope.accountId ?? data.accountId;
  if (!accountId) throw new Error("accountId requerido");

  const role = ROLE_MAP[data.role] || (data.role && ["SUPERADMIN", "ADMIN", "OPERATOR"].includes(data.role) ? data.role : "OPERATOR");

  const identity = await prisma.identity.create({
    data: { fullName: data.fullName || null },
  });
  return prisma.accountMembership.create({
    data: {
      identityId: identity.id,
      accountId,
      role,
      status: "ACTIVE",
    },
    include: { identity: true },
  });
}

async function updateUsuario(id, data, usuarioToken) {
  const existente = await prisma.accountMembership.findFirst({
    where: { id: Number(id), ...buildScope(usuarioToken) },
  });
  if (!existente) return null;

  const updateData = {};
  if (data.role) updateData.role = ROLE_MAP[data.role] || (["SUPERADMIN", "ADMIN", "OPERATOR"].includes(data.role) ? data.role : undefined);
  if (data.status) updateData.status = data.status;

  return prisma.accountMembership.update({
    where: { id: Number(id) },
    data: updateData,
    include: { identity: true },
  });
}

async function deleteUsuario(id, usuarioToken) {
  const existente = await prisma.accountMembership.findFirst({
    where: { id: Number(id), ...buildScope(usuarioToken) },
  });
  if (!existente) return null;

  return prisma.accountMembership.delete({
    where: { id: Number(id) },
  });
}

module.exports = {
  findAllUsuarios,
  findUsuarioById,
  createUsuario,
  updateUsuario,
  deleteUsuario,
};
