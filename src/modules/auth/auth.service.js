const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const repository = require("./auth.repository");
const identityRepository = require("../identity/identity.repository");
const { signAccessToken } = require("../../shared/utils/jwt");

function unauthorized(message) {
  const err = new Error(message);
  err.statusCode = 401;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

async function loginWeb({ identifier, password }) {
  const credential = await repository.findCredentialByTypeAndIdentifier(
    "PASSWORD",
    String(identifier)
  );

  if (!credential || !credential.isActive || !credential.identity) {
    throw unauthorized("Credenciales inválidas");
  }
  if (!credential.secretHash) {
    throw unauthorized("Credenciales inválidas");
  }

  const passwordOk = await bcrypt.compare(String(password), credential.secretHash);
  if (!passwordOk) {
    throw unauthorized("Credenciales inválidas");
  }

  const memberships = await identityRepository.getMembershipsWithScopes(credential.identityId);
  const activeMemberships = memberships.filter((m) => m.status === "ACTIVE");
  if (activeMemberships.length === 0) {
    throw unauthorized("Credenciales inválidas");
  }

  const operadorMemberships = activeMemberships.filter((m) => m.role === "OPERATOR");
  if (operadorMemberships.length === activeMemberships.length) {
    throw forbidden("operador solo puede iniciar por Telegram");
  }

  const membership = activeMemberships.find((m) => m.role !== "OPERATOR") || activeMemberships[0];

  const roleMap = { SUPERADMIN: "superadministrador", ADMIN: "administrador_cuenta", OPERATOR: "operador" };
  const tokenPayload = {
    id: credential.identityId,
    accountId: membership.accountId,
    role: roleMap[membership.role] || membership.role,
    membershipId: membership.id,
    permissionsVersion: 1,
  };

  const accessToken = signAccessToken(tokenPayload);
  return {
    accessToken,
    user: {
      id: credential.identityId,
      accountId: membership.accountId,
      role: roleMap[membership.role] || membership.role,
      membershipId: membership.id,
      permissionsVersion: 1,
    },
  };
}

async function loginTelegram({ telegramAuth, telegramId }) {
  validateTelegramAuth(telegramAuth);

  const identifier = String(telegramId ?? telegramAuth.id);
  const credential = await repository.findCredentialByTypeAndIdentifier("TELEGRAM", identifier);

  if (!credential || !credential.isActive || !credential.identity) {
    throw unauthorized("Credenciales inválidas");
  }

  const memberships = await identityRepository.getMembershipsWithScopes(credential.identityId);
  const activeMemberships = memberships.filter((m) => m.status === "ACTIVE");
  if (activeMemberships.length === 0) {
    throw unauthorized("Credenciales inválidas");
  }

  const membership = activeMemberships[0];
  const roleMap = { SUPERADMIN: "superadministrador", ADMIN: "administrador_cuenta", OPERATOR: "operador" };

  const tokenPayload = {
    id: credential.identityId,
    accountId: membership.accountId,
    role: roleMap[membership.role] || membership.role,
    membershipId: membership.id,
    permissionsVersion: 1,
  };

  const accessToken = signAccessToken(tokenPayload);
  return {
    accessToken,
    user: {
      id: credential.identityId,
      accountId: membership.accountId,
      role: roleMap[membership.role] || membership.role,
      membershipId: membership.id,
      permissionsVersion: 1,
    },
  };
}

function validateTelegramAuth(telegramAuth) {
  if (!telegramAuth || typeof telegramAuth !== "object") {
    throw unauthorized("telegramAuth requerido");
  }
  if (!telegramAuth.hash) {
    throw unauthorized("telegramAuth.hash requerido");
  }
  if (!telegramAuth.auth_date) {
    throw unauthorized("telegramAuth.auth_date requerido");
  }
  if (!process.env.BOT_TOKEN) {
    throw unauthorized("BOT_TOKEN no configurado para validar Telegram");
  }

  const { hash, ...data } = telegramAuth;
  const dataCheckString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(process.env.BOT_TOKEN).digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) {
    throw unauthorized("Firma Telegram inválida");
  }

  const authDate = Number(telegramAuth.auth_date);
  if (!Number.isNaN(authDate)) {
    const now = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 60 * 10;
    if (now - authDate > maxAgeSeconds) {
      throw unauthorized("Autenticación Telegram expirada");
    }
  }
}

module.exports = {
  loginWeb,
  loginTelegram,
};
