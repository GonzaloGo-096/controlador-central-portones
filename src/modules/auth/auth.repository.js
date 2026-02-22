const { prisma } = require("../../infrastructure/database/prismaClient");

function findCredentialByTypeAndIdentifier(type, identifier) {
  return prisma.userCredential.findUnique({
    where: {
      type_identifier: {
        type,
        identifier,
      },
    },
    include: {
      user: true,
    },
  });
}

function hasGateAccess(userId, gateId) {
  return prisma.userGate.findFirst({
    where: {
      userId,
      gateId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
}

function hasGateAccessByAccount(userId, gateId, accountId, requiredPermission) {
  return prisma.userGate.findFirst({
    where: {
      userId,
      gateId,
      isActive: true,
      deletedAt: null,
      ...(requiredPermission ? { permission: requiredPermission } : {}),
      gate: {
        isActive: true,
        deletedAt: null,
        portonGroup: {
          accountId,
          isActive: true,
          deletedAt: null,
        },
      },
    },
    select: { id: true },
  });
}

module.exports = {
  findCredentialByTypeAndIdentifier,
  hasGateAccess,
  hasGateAccessByAccount,
};
