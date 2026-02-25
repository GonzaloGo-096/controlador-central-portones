/**
 * Scope de Cultivos según membership.
 * Desacoplado de identity.
 */

const ROLES = { SUPERADMIN: "SUPERADMIN", ADMIN: "ADMIN", OPERATOR: "OPERATOR" };

function buildCultivoScopeForMembership(membership) {
  if (!membership) return { id: -1 };
  if (membership.role === ROLES.SUPERADMIN) return { isActive: true, deletedAt: null };
  if (membership.role === ROLES.ADMIN) {
    return { accountId: membership.accountId, isActive: true, deletedAt: null };
  }
  return { id: -1 };
}

async function isCultivosEnabledForMembership(membership) {
  if (!membership || membership.role === ROLES.OPERATOR) return false;
  const { prisma } = require("../../infrastructure/database/prismaClient");
  const count = await prisma.cultivo.count({
    where:
      membership.role === ROLES.SUPERADMIN
        ? { isActive: true, deletedAt: null }
        : { accountId: membership.accountId, isActive: true, deletedAt: null },
  });
  return count > 0;
}

module.exports = {
  buildCultivoScopeForMembership,
  isCultivosEnabledForMembership,
};
