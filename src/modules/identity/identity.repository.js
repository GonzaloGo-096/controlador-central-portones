/**
 * Repository para Identity, Credential, AccountMembership.
 * Usado por el flujo Telegram y por auth.
 */

const { prisma } = require("../../infrastructure/database/prismaClient");

async function findCredentialByTypeAndIdentifier(type, identifier) {
  return prisma.credential.findUnique({
    where: {
      type_identifier: { type, identifier: String(identifier) },
    },
    include: {
      identity: {
        include: {
          accountMemberships: {
            where: { status: "ACTIVE" },
            include: { account: true },
          },
        },
      },
    },
  });
}

async function getMembershipsWithScopes(identityId) {
  return prisma.accountMembership.findMany({
    where: { identityId, status: "ACTIVE" },
    include: {
      account: true,
      portonGroups: { include: { portonGroup: true } },
      gatePermissions: { include: { gate: { include: { portonGroup: true } } } },
    },
    orderBy: { accountId: "asc" },
  });
}

async function hasGatePermissionByMembership(membershipId, gateId, permission) {
  return prisma.membershipGatePermission.findFirst({
    where: {
      membershipId,
      gateId,
      permission: permission || "open",
    },
    select: { id: true },
  });
}

module.exports = {
  findCredentialByTypeAndIdentifier,
  getMembershipsWithScopes,
  hasGatePermissionByMembership,
};
