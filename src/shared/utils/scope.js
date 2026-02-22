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

module.exports = {
  isSuperadmin,
  getAccountIdFromToken,
  requireAccountId,
};
