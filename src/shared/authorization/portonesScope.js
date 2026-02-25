/**
 * Scope de Portones según membership.
 * Desacoplado de identity; solo depende del shape del membership.
 */

const ROLES = { SUPERADMIN: "SUPERADMIN", ADMIN: "ADMIN", OPERATOR: "OPERATOR" };

function buildPortonGroupScopeForMembership(membership) {
  if (!membership) return { id: -1 };
  if (membership.role === ROLES.SUPERADMIN) return { isActive: true, deletedAt: null };
  if (membership.role === ROLES.ADMIN) {
    return { accountId: membership.accountId, isActive: true, deletedAt: null };
  }
  const groupIds = (membership.portonGroups || []).map((g) => g.portonGroupId);
  const gateIds = (membership.gatePermissions || []).map((gp) => gp.gate?.portonGroupId).filter(Boolean);
  const allGroupIds = [...new Set([...groupIds, ...gateIds])];
  if (allGroupIds.length === 0) return { id: -1 };
  return {
    id: { in: allGroupIds },
    accountId: membership.accountId,
    isActive: true,
    deletedAt: null,
  };
}

function buildGateScopeForMembership(membership) {
  if (!membership) return { id: -1 };
  if (membership.role === ROLES.SUPERADMIN || membership.role === ROLES.ADMIN) return {};
  const gateIds = (membership.gatePermissions || []).map((gp) => gp.gateId);
  const groupIds = (membership.portonGroups || []).map((g) => g.portonGroupId);
  if (gateIds.length === 0 && groupIds.length === 0) return { id: -1 };
  const scope = { isActive: true, deletedAt: null, OR: [] };
  if (gateIds.length > 0) scope.OR.push({ id: { in: gateIds } });
  if (groupIds.length > 0) scope.OR.push({ portonGroupId: { in: groupIds } });
  return scope;
}

async function isPortonesEnabledForMembership(membership) {
  if (!membership) return false;
  if (membership.role === ROLES.SUPERADMIN || membership.role === ROLES.ADMIN) {
    const { prisma } = require("../../infrastructure/database/prismaClient");
    const count = await prisma.portonGroup.count({
      where: { accountId: membership.accountId, isActive: true, deletedAt: null },
    });
    return count > 0;
  }
  const groupsCount = membership.portonGroups?.length ?? 0;
  const gatesCount = membership.gatePermissions?.length ?? 0;
  return groupsCount > 0 || gatesCount > 0;
}

module.exports = {
  buildPortonGroupScopeForMembership,
  buildGateScopeForMembership,
  isPortonesEnabledForMembership,
};
