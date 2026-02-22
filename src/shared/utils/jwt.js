const jwt = require("jsonwebtoken");

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

function signAccessToken(user) {
  const payload = {
    sub: user.id,
    account_id: user.accountId,
    role: user.role,
    permissions_version: user.permissionsVersion,
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
