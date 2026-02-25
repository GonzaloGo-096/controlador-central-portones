/**
 * Servicio de resolución de identidad para Telegram.
 * Orquesta: Identity + memberships, delega scope a authorization.
 */

const identityRepository = require("./identity.repository");
const { hasOpenAccess: gateAccessHasOpenAccess } = require("../../shared/authorization/gateAccess");
const {
  buildPortonGroupScopeForMembership,
  buildGateScopeForMembership,
  isPortonesEnabledForMembership: isPortonesEnabledFromScope,
} = require("../../shared/authorization/portonesScope");
const {
  buildCultivoScopeForMembership,
  isCultivosEnabledForMembership: isCultivosEnabledFromScope,
} = require("../../shared/authorization/cultivosScope");

const MEMBERSHIP_ROLES = { SUPERADMIN: "SUPERADMIN", ADMIN: "ADMIN", OPERATOR: "OPERATOR" };

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

async function isPortonesEnabledForMembership(membership) {
  return isPortonesEnabledFromScope(membership);
}

async function isCultivosEnabledForMembership(membership) {
  return isCultivosEnabledFromScope(membership);
}

/**
 * Devuelve los gates autorizados para un telegramId (vía Identity + memberships).
 * @param {string|number} telegramId
 * @returns {Promise<Array<{ gateId: number, gateName: string, identifier?: string | null, topic_mqtt?: string | null }>>}
 */
async function getAuthorizedGatesForTelegramId(telegramId) {
  const resolved = await resolveIdentityFromTelegramId(telegramId);
  if (!resolved || !resolved.memberships?.length) return [];

  const { prisma } = require("../../infrastructure/database/prismaClient");
  const memberships = await identityRepository.getMembershipsWithScopes(resolved.identity.id);
  const seenIds = new Set();
  const result = [];

  for (const m of memberships) {
    if (m.status !== "ACTIVE") continue;
    let where = { isActive: true, deletedAt: null };
    if (m.role === MEMBERSHIP_ROLES.SUPERADMIN) {
      // todos los gates
    } else if (m.role === MEMBERSHIP_ROLES.ADMIN) {
      where.portonGroup = { accountId: m.accountId, isActive: true, deletedAt: null };
    } else {
      const scope = buildGateScopeForMembership(m);
      if (scope.id === -1) continue;
      where = { ...where, ...scope };
    }
    const rows = await prisma.gate.findMany({
      where,
      select: { id: true, name: true, identifier: true, topicMqtt: true },
    });
    for (const g of rows) {
      if (seenIds.has(g.id)) continue;
      seenIds.add(g.id);
      result.push({
        gateId: g.id,
        gateName: g.name,
        identifier: g.identifier ?? null,
        topic_mqtt: g.topicMqtt ?? null,
      });
    }
  }
  return result;
}

/**
 * Delega a gateAccess.hasOpenAccess para mantener compatibilidad.
 */
async function hasOpenAccess(membership, gateId) {
  return gateAccessHasOpenAccess(membership, gateId);
}

module.exports = {
  resolveIdentityFromTelegramId,
  getMemberships,
  getAuthorizedGatesForTelegramId,
  isPortonesEnabledForMembership,
  isCultivosEnabledForMembership,
  buildPortonGroupScopeForMembership,
  buildCultivoScopeForMembership,
  buildGateScopeForMembership,
  hasOpenAccess,
  MEMBERSHIP_ROLES,
};
