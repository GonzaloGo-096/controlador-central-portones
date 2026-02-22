const express = require("express");
const authRepository = require("../../modules/auth/auth.repository");
const { prisma } = require("../database/prismaClient");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles } = require("../../middleware/requireRoles");
const { requireGateAccess } = require("../../middleware/requireGateAccess");
const { USER_ROLES, CREDENTIAL_TYPES } = require("../../shared/types/auth.types");
const { abrirPortonConDebounce } = require("../../modules/portones/portones.service");

const router = express.Router();

function authenticateBotSecret(req, res, next) {
  const expectedSecret = process.env.TELEGRAM_BOT_INTERNAL_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: "TELEGRAM_BOT_INTERNAL_SECRET no configurado" });
  }

  const providedSecret = req.headers["x-bot-secret"];
  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Bot secret inválido" });
  }

  return next();
}

async function resolveTokenUserFromTelegramId(telegramIdRaw) {
  const credential = await authRepository.findCredentialByTypeAndIdentifier(
    CREDENTIAL_TYPES.TELEGRAM,
    String(telegramIdRaw)
  );

  if (!credential || !credential.isActive || !credential.user || !credential.user.isActive) {
    return null;
  }

  return {
    sub: credential.user.id,
    account_id: credential.user.accountId,
    role: credential.user.role,
  };
}

async function hasOpenAccess(usuarioToken, portonId) {
  if (usuarioToken.role === USER_ROLES.SUPERADMIN) {
    return true;
  }

  const gate = await prisma.gate.findFirst({
    where: {
      id: portonId,
      isActive: true,
      deletedAt: null,
    },
    include: {
      portonGroup: {
        select: {
          accountId: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!gate || !gate.portonGroup || !gate.portonGroup.isActive || gate.portonGroup.deletedAt) {
    return false;
  }

  if (usuarioToken.role === USER_ROLES.ADMIN_CUENTA) {
    return Number(usuarioToken.account_id) === Number(gate.portonGroup.accountId);
  }

  const access = await authRepository.hasGateAccessByAccount(
    Number(usuarioToken.sub),
    portonId,
    Number(usuarioToken.account_id),
    "open"
  );
  return Boolean(access);
}

router.post("/bot/portones/:id/abrir", authenticateBotSecret, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const telegramId = req.body?.telegramId;
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId es requerido" });
  }

  try {
    const usuarioToken = await resolveTokenUserFromTelegramId(telegramId);
    if (!usuarioToken) {
      return res.status(404).json({ error: "Usuario de Telegram no encontrado o inactivo" });
    }

    const allowed = await hasOpenAccess(usuarioToken, id);
    if (!allowed) {
      return res.status(403).json({ error: "Sin acceso al portón" });
    }

    const result = await abrirPortonConDebounce({
      portonId: id,
      usuarioToken,
      canal: "telegram",
    });

    if (result.notFound) return res.status(404).json({ error: "Portón no encontrado" });
    if (result.debounced) {
      return res.status(429).json({ error: "Comando bloqueado por debounce" });
    }
    return res.status(200).json({ ok: true, canal: "telegram" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post(
  "/portones/:id/abrir",
  authenticateJwt,
  requireRoles([USER_ROLES.SUPERADMIN, USER_ROLES.ADMIN_CUENTA, USER_ROLES.OPERADOR]),
  requireGateAccess((req) => req.params.id, { permission: "open" }),
  async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

    try {
      const result = await abrirPortonConDebounce({
        portonId: id,
        usuarioToken: req.user,
        canal: "telegram",
      });

      if (result.notFound) return res.status(404).json({ error: "Portón no encontrado" });
      if (result.debounced) {
        return res.status(429).json({ error: "Comando bloqueado por debounce" });
      }
      return res.status(200).json({ ok: true, canal: "telegram" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
