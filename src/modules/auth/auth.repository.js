/**
 * Auth repository - usa Identity/Credential (modelo nuevo).
 */

const identityRepository = require("../identity/identity.repository");

function findCredentialByTypeAndIdentifier(type, identifier) {
  return identityRepository.findCredentialByTypeAndIdentifier(type, identifier);
}

async function hasGateAccessByMembership(membershipId, gateId, accountId, requiredPermission) {
  const { prisma } = require("../../infrastructure/database/prismaClient");
  const perm = await prisma.membershipGatePermission.findFirst({
    where: {
      membershipId,
      gateId,
      permission: requiredPermission || "open",
    },
    include: { gate: { include: { portonGroup: true } } },
  });
  return !!perm?.gate && perm.gate.portonGroup?.accountId === accountId;
}

async function hasGateAccessByAccount(identityId, gateId, accountId, requiredPermission) {
  const { prisma } = require("../../infrastructure/database/prismaClient");
  const membership = await prisma.accountMembership.findFirst({
    where: {
      identityId,
      accountId,
      status: "ACTIVE",
    },
    include: {
      portonGroups: { include: { portonGroup: true } },
      gatePermissions: { include: { gate: true } },
    },
  });
  if (!membership) return null;

  if (membership.role === "SUPERADMIN" || membership.role === "ADMIN") {
    const gate = await prisma.gate.findFirst({
      where: { id: gateId, isActive: true, deletedAt: null },
      include: { portonGroup: { select: { accountId: true } } },
    });
    return !!gate && gate.portonGroup.accountId === accountId;
  }

  const hasDirect = await prisma.membershipGatePermission.findFirst({
    where: {
      membershipId: membership.id,
      gateId,
      permission: requiredPermission || "open",
    },
  });
  if (hasDirect) return true;

  const groupIds = membership.portonGroups.map((g) => g.portonGroupId);
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
  findCredentialByTypeAndIdentifier,
  hasGateAccessByAccount,
  hasGateAccessByMembership,
};
