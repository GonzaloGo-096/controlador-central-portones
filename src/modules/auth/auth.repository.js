/**
 * Auth repository - usa Identity/Credential (modelo nuevo).
 */

const identityRepository = require("../identity/identity.repository");
const { hasOpenAccessByAccount } = require("../../shared/authorization/gateAccess");

function findCredentialByTypeAndIdentifier(type, identifier) {
  return identityRepository.findCredentialByTypeAndIdentifier(type, identifier);
}

async function hasGateAccessByAccount(identityId, gateId, accountId) {
  return hasOpenAccessByAccount(identityId, gateId, accountId);
}

module.exports = {
  findCredentialByTypeAndIdentifier,
  hasGateAccessByAccount,
};
