const { USER_ROLES } = require("../types/auth.types");

function isSuperadmin(user) {
  return user?.role === USER_ROLES.SUPERADMIN;
}

function getAccountIdFromToken(user) {
  const accountId = Number(user?.account_id);
  return Number.isNaN(accountId) ? null : accountId;
}

function requireAccountId(user) {
  const accountId = getAccountIdFromToken(user);
  if (accountId == null) {
    const err = new Error("Token sin account_id válido");
    err.statusCode = 401;
    throw err;
  }
  return accountId;
}

/**
 * Construye el where para Gate según usuarioToken (JWT con identity/membership).
 * Para operador necesita membershipId o se hace fetch por identityId+accountId.
 */
async function buildGateWhereFromToken(usuarioToken) {
  if (!usuarioToken) return { id: -1 };
  if (usuarioToken.role === USER_ROLES.SUPERADMIN) return {};
  if (usuarioToken.role === USER_ROLES.ADMIN_CUENTA) {
    return {
      portonGroup: {
        accountId: requireAccountId(usuarioToken),
        isActive: true,
        deletedAt: null,
      },
    };
  }

  const { prisma } = require("../../infrastructure/database/prismaClient");
  let membership;
  if (usuarioToken.membershipId) {
    membership = await prisma.accountMembership.findFirst({
      where: { id: usuarioToken.membershipId, status: "ACTIVE" },
      include: { portonGroups: true, gatePermissions: true },
    });
  } else {
    membership = await prisma.accountMembership.findFirst({
      where: {
        identityId: usuarioToken.sub,
        accountId: requireAccountId(usuarioToken),
        status: "ACTIVE",
      },
      include: { portonGroups: true, gatePermissions: true },
    });
  }
  if (!membership) return { id: -1 };

  const groupIds = membership.portonGroups.map((g) => g.portonGroupId);
  const gateIds = membership.gatePermissions.map((gp) => gp.gateId);
  if (groupIds.length === 0 && gateIds.length === 0) return { id: -1 };

  const or = [];
  if (groupIds.length > 0) or.push({ portonGroupId: { in: groupIds } });
  if (gateIds.length > 0) or.push({ id: { in: gateIds } });

  return {
    OR: or,
    isActive: true,
    deletedAt: null,
  };
}

/**
 * Sync version para compatibilidad - devuelve scope básico.
 * Para operador con membership se debe usar buildGateWhereFromToken (async).
 */
function whereByScope(usuarioToken) {
  if (!usuarioToken) return { id: -1 };
  if (usuarioToken.role === USER_ROLES.SUPERADMIN) return {};
  if (usuarioToken.role === USER_ROLES.ADMIN_CUENTA) {
    return {
      portonGroup: {
        accountId: requireAccountId(usuarioToken),
        isActive: true,
        deletedAt: null,
      },
    };
  }
  const mid = usuarioToken.membershipId ?? usuarioToken.membership_id;
  if (!mid) return { id: -1 };
  return {
    OR: [
      { membershipGatePermissions: { some: { membershipId: mid } } },
      { portonGroup: { membershipPortonGroups: { some: { membershipId: mid } } } },
    ],
    isActive: true,
    deletedAt: null,
  };
}

module.exports = {
  isSuperadmin,
  getAccountIdFromToken,
  requireAccountId,
  buildGateWhereFromToken,
  whereByScope,
};
