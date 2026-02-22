const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const repository = require("./auth.repository");
const { signAccessToken } = require("../../shared/utils/jwt");
const { CREDENTIAL_TYPES, USER_ROLES } = require("../../shared/types/auth.types");

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
    CREDENTIAL_TYPES.PASSWORD,
    String(identifier)
  );

  if (!credential || !credential.isActive || !credential.user || !credential.user.isActive) {
    throw unauthorized("Credenciales inválidas");
  }
  if (!credential.secretHash) {
    throw unauthorized("Credenciales inválidas");
  }

  const passwordOk = await bcrypt.compare(String(password), credential.secretHash);
  if (!passwordOk) {
    throw unauthorized("Credenciales inválidas");
  }

  if (credential.user.role === USER_ROLES.OPERADOR) {
    throw forbidden("operador solo puede iniciar por Telegram");
  }

  const accessToken = signAccessToken(credential.user);
  return {
    accessToken,
    user: {
      id: credential.user.id,
      accountId: credential.user.accountId,
      role: credential.user.role,
      permissionsVersion: credential.user.permissionsVersion,
    },
  };
}

async function loginTelegram({ telegramAuth, telegramId }) {
  validateTelegramAuth(telegramAuth);

  const identifier = String(telegramId ?? telegramAuth.id);
  const credential = await repository.findCredentialByTypeAndIdentifier(
    CREDENTIAL_TYPES.TELEGRAM,
    identifier
  );

  if (!credential || !credential.isActive || !credential.user || !credential.user.isActive) {
    throw unauthorized("Credenciales inválidas");
  }

  const accessToken = signAccessToken(credential.user);
  return {
    accessToken,
    user: {
      id: credential.user.id,
      accountId: credential.user.accountId,
      role: credential.user.role,
      permissionsVersion: credential.user.permissionsVersion,
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

  // Telegram recomienda rechazar auth muy antigua para evitar replay.
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
