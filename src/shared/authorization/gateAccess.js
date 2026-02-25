/**
 * Autorización centralizada para Gates.
 * Acepta membership (Identity) o usuarioToken (JWT) normalizado.
 * Usado por scope.js (API REST), identity.telegram (bot) y auth.
 */

const identityRepository = require("../../modules/identity/identity.repository");
const { prisma } = require("../../infrastructure/database/prismaClient");

const ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
};

/**
 * Construye el where de Prisma para Gate según membership.
 * @param {Object} membership - { role, accountId, portonGroups?: [{portonGroupId}], gatePermissions?: [{gateId}] }
 * @returns {Object} where para prisma.gate.findMany
 */
function buildGateWhereFromMembership(membership) {
  if (!membership) return { id: -1 };
  if (membership.role === ROLES.SUPERADMIN || membership.role === ROLES.ADMIN) {
    if (membership.role === ROLES.SUPERADMIN) {
      return { isActive: true, deletedAt: null };
    }
    return {
      portonGroup: {
        accountId: membership.accountId,
        isActive: true,
        deletedAt: null,
      },
      isActive: true,
      deletedAt: null,
    };
  }

  const gateIds = (membership.gatePermissions || []).map((gp) => gp.gateId);
  const groupIds = (membership.portonGroups || []).map((g) => g.portonGroupId);
  if (gateIds.length === 0 && groupIds.length === 0) return { id: -1 };

  const or = [];
  if (gateIds.length > 0) or.push({ id: { in: gateIds } });
  if (groupIds.length > 0) or.push({ portonGroupId: { in: groupIds } });

  return {
    OR: or,
    isActive: true,
    deletedAt: null,
  };
}

/**
 * Verifica si el membership tiene permiso para abrir el gate.
 * @param {Object} membership
 * @param {number} gateId
 * @returns {Promise<boolean>}
 */
async function hasOpenAccess(membership, gateId) {
  if (!membership) return false;
  if (membership.role === ROLES.SUPERADMIN || membership.role === ROLES.ADMIN) {
    const gate = await prisma.gate.findFirst({
      where: { id: gateId, isActive: true, deletedAt: null },
      include: { portonGroup: { select: { accountId: true } } },
    });
    if (!gate) return false;
    if (membership.role === ROLES.SUPERADMIN) return true;
    return gate.portonGroup.accountId === membership.accountId;
  }

  const hasDirect = await identityRepository.hasGatePermissionByMembership(
    membership.id,
    gateId,
    "open"
  );
  if (hasDirect) return true;

  const groupIds = (membership.portonGroups || []).map((g) => g.portonGroupId);
  if (groupIds.length === 0) return false;

  const gate = await prisma.gate.findFirst({
    where: {
      id: gateId,
      portonGroupId: { in: groupIds },
      isActive: true,
      deletedAt: null,
    },
  });
  return !!gate;
}

/**
 * Verifica acceso por identityId + accountId (JWT). Obtiene membership y delega a hasOpenAccess.
 */
async function hasOpenAccessByAccount(identityId, gateId, accountId) {
  const membership = await prisma.accountMembership.findFirst({
    where: { identityId, accountId, status: "ACTIVE" },
    include: {
      portonGroups: { select: { portonGroupId: true } },
      gatePermissions: { select: { gateId: true } },
    },
  });
  if (!membership) return false;
  return hasOpenAccess(membership, gateId);
}

module.exports = {
  ROLES,
  buildGateWhereFromMembership,
  hasOpenAccess,
  hasOpenAccessByAccount,
};
