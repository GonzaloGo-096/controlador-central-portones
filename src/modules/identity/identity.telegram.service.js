/**
 * Servicio de resolución de identidad para Telegram.
 * resolveIdentityFromTelegramId, getMemberships, cálculos de módulos y scope.
 */

const identityRepository = require("./identity.repository");

const MEMBERSHIP_ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
};

/**
 * Resuelve Identity desde telegramId.
 * @param {string} telegramId
 * @returns {Promise<{ identity, credential, memberships } | null>}
 */
async function resolveIdentityFromTelegramId(telegramId) {
  const credential = await identityRepository.findCredentialByTypeAndIdentifier(
    "TELEGRAM",
    String(telegramId)
  );

  if (!credential || !credential.isActive || !credential.identity) {
    return null;
  }

  const identity = credential.identity;
  const memberships = identity.accountMemberships || [];

  return {
    identity,
    credential,
    memberships: memberships.filter((m) => m.status === "ACTIVE"),
  };
}

/**
 * Obtiene memberships con scopes para una identity.
 * Si hay 1 => devuelve activeMembership.
 * Si hay >1 => devuelve lista y requiresAccountSelection.
 *
 * @param {string} identityId
 * @returns {Promise<{ memberships, activeMembership, requiresAccountSelection }>}
 */
async function getMemberships(identityId) {
  const memberships = await identityRepository.getMembershipsWithScopes(identityId);

  if (memberships.length === 0) {
    return { memberships: [], activeMembership: null, requiresAccountSelection: false };
  }

  if (memberships.length === 1) {
    return {
      memberships,
      activeMembership: memberships[0],
      requiresAccountSelection: false,
    };
  }

  return {
    memberships,
    activeMembership: null,
    requiresAccountSelection: true,
  };
}

/**
 * Calcula si Portones está habilitado para el membership activo.
 * Admin: true si hay al menos 1 portonGroup en la cuenta.
 * Operator: true si hay al menos 1 MembershipPortonGroup o MembershipGatePermission.
 */
async function isPortonesEnabledForMembership(membership) {
  if (!membership) return false;

  if (membership.role === MEMBERSHIP_ROLES.SUPERADMIN || membership.role === MEMBERSHIP_ROLES.ADMIN) {
    const { prisma } = require("../../infrastructure/database/prismaClient");
    const count = await prisma.portonGroup.count({
      where: {
        accountId: membership.accountId,
        isActive: true,
        deletedAt: null,
      },
    });
    return count > 0;
  }

  const groupsCount = membership.portonGroups?.length ?? 0;
  const gatesCount = membership.gatePermissions?.length ?? 0;
  return groupsCount > 0 || gatesCount > 0;
}

/**
 * Calcula si Cultivos está habilitado para el membership activo.
 * Solo admins; operadores nunca.
 */
async function isCultivosEnabledForMembership(membership) {
  if (!membership || membership.role === MEMBERSHIP_ROLES.OPERATOR) return false;

  const { prisma } = require("../../infrastructure/database/prismaClient");
  const count = await prisma.cultivo.count({
    where:
      membership.role === MEMBERSHIP_ROLES.SUPERADMIN
        ? { isActive: true, deletedAt: null }
        : {
            accountId: membership.accountId,
            isActive: true,
            deletedAt: null,
          },
  });
  return count > 0;
}

/**
 * Construye el where para PortonGroup según membership.
 */
function buildPortonGroupScopeForMembership(membership) {
  if (!membership) return { id: -1 };

  if (membership.role === MEMBERSHIP_ROLES.SUPERADMIN) {
    return { isActive: true, deletedAt: null };
  }

  if (membership.role === MEMBERSHIP_ROLES.ADMIN) {
    return {
      accountId: membership.accountId,
      isActive: true,
      deletedAt: null,
    };
  }

  const groupIds = (membership.portonGroups || []).map((g) => g.portonGroupId);
  const gateIds = (membership.gatePermissions || []).map((gp) => gp.gate?.portonGroupId).filter(Boolean);
  const allGroupIds = [...new Set([...groupIds, ...gateIds])];

  if (allGroupIds.length === 0) {
    return { id: -1 };
  }

  return {
    id: { in: allGroupIds },
    accountId: membership.accountId,
    isActive: true,
    deletedAt: null,
  };
}

/**
 * Construye el where para Cultivo según membership.
 * Mismo patrón conceptual que buildPortonGroupScopeForMembership.
 * OPERATOR: por ahora cultivos no habilitados → { id: -1 }.
 */
function buildCultivoScopeForMembership(membership) {
  if (!membership) return { id: -1 };

  if (membership.role === MEMBERSHIP_ROLES.SUPERADMIN) {
    return { isActive: true, deletedAt: null };
  }

  if (membership.role === MEMBERSHIP_ROLES.ADMIN) {
    return {
      accountId: membership.accountId,
      isActive: true,
      deletedAt: null,
    };
  }

  // OPERATOR: cultivos no habilitados por ahora
  return { id: -1 };
}

/**
 * Construye el where para Gate según membership.
 */
function buildGateScopeForMembership(membership) {
  if (!membership) return { id: -1 };

  if (membership.role === MEMBERSHIP_ROLES.SUPERADMIN || membership.role === MEMBERSHIP_ROLES.ADMIN) {
    return {};
  }

  const gateIds = (membership.gatePermissions || []).map((gp) => gp.gateId);
  const groupIds = (membership.portonGroups || []).map((g) => g.portonGroupId);

  if (gateIds.length === 0 && groupIds.length === 0) {
    return { id: -1 };
  }

  const scope = {
    isActive: true,
    deletedAt: null,
    OR: [],
  };

  if (gateIds.length > 0) {
    scope.OR.push({ id: { in: gateIds } });
  }
  if (groupIds.length > 0) {
    scope.OR.push({ portonGroupId: { in: groupIds } });
  }

  return scope;
}

/**
 * Verifica si el membership tiene permiso para abrir el gate (para uso futuro).
 */
async function hasOpenAccess(membership, gateId) {
  if (!membership) return false;
  if (membership.role === MEMBERSHIP_ROLES.SUPERADMIN || membership.role === MEMBERSHIP_ROLES.ADMIN) {
    const { prisma } = require("../../infrastructure/database/prismaClient");
    const gate = await prisma.gate.findFirst({
      where: { id: gateId, isActive: true, deletedAt: null },
      include: { portonGroup: { select: { accountId: true } } },
    });
    if (!gate) return false;
    if (membership.role === MEMBERSHIP_ROLES.SUPERADMIN) return true;
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

  const { prisma } = require("../../infrastructure/database/prismaClient");
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

module.exports = {
  resolveIdentityFromTelegramId,
  getMemberships,
  isPortonesEnabledForMembership,
  isCultivosEnabledForMembership,
  buildPortonGroupScopeForMembership,
  buildCultivoScopeForMembership,
  buildGateScopeForMembership,
  hasOpenAccess,
  MEMBERSHIP_ROLES,
};
