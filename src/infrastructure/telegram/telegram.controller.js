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

function getTelegramIdFromRequest(req) {
  const raw = req.method === "GET" ? req.query?.telegramId : req.body?.telegramId;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  return String(raw);
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
    full_name: credential.user.fullName,
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

function buildGroupScope(usuarioToken) {
  if (usuarioToken.role === USER_ROLES.SUPERADMIN) {
    return {};
  }

  if (usuarioToken.role === USER_ROLES.ADMIN_CUENTA) {
    return {
      accountId: Number(usuarioToken.account_id),
      isActive: true,
      deletedAt: null,
    };
  }

  return {
    accountId: Number(usuarioToken.account_id),
    isActive: true,
    deletedAt: null,
    gates: {
      some: {
        isActive: true,
        deletedAt: null,
        userGates: {
          some: {
            userId: Number(usuarioToken.sub),
            isActive: true,
            deletedAt: null,
          },
        },
      },
    },
  };
}

function buildGateScope(usuarioToken) {
  if (usuarioToken.role === USER_ROLES.SUPERADMIN || usuarioToken.role === USER_ROLES.ADMIN_CUENTA) {
    return {};
  }

  return {
    userGates: {
      some: {
        userId: Number(usuarioToken.sub),
        isActive: true,
        deletedAt: null,
      },
    },
  };
}

async function resolveBotUserOrFail(req, res) {
  const telegramId = getTelegramIdFromRequest(req);
  if (!telegramId) {
    res.status(400).json({ error: "telegramId es requerido" });
    return null;
  }

  const usuarioToken = await resolveTokenUserFromTelegramId(telegramId);
  if (!usuarioToken) {
    res.status(404).json({ error: "Usuario de Telegram no encontrado o inactivo" });
    return null;
  }

  return usuarioToken;
}

router.get("/bot/menu", authenticateBotSecret, async (req, res) => {
  try {
    const usuarioToken = await resolveBotUserOrFail(req, res);
    if (!usuarioToken) return;

    const gruposPortonesCount = await prisma.portonGroup.count({
      where: buildGroupScope(usuarioToken),
    });

    const canAccessCultivos = usuarioToken.role !== USER_ROLES.OPERADOR;
    const cultivosCount = canAccessCultivos
      ? await prisma.cultivo.count({
          where:
            usuarioToken.role === USER_ROLES.SUPERADMIN
              ? { isActive: true, deletedAt: null }
              : {
                  accountId: Number(usuarioToken.account_id),
                  isActive: true,
                  deletedAt: null,
                },
        })
      : 0;

    return res.status(200).json({
      user: {
        id: Number(usuarioToken.sub),
        fullName: usuarioToken.full_name,
        accountId: Number(usuarioToken.account_id),
        role: usuarioToken.role,
      },
      modules: [
        {
          key: "portones",
          label: "Portones",
          enabled: gruposPortonesCount > 0,
        },
        {
          key: "cultivos",
          label: "Cultivos",
          enabled: canAccessCultivos && cultivosCount > 0,
        },
      ],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/bot/modulos/portones/grupos", authenticateBotSecret, async (req, res) => {
  try {
    const usuarioToken = await resolveBotUserOrFail(req, res);
    if (!usuarioToken) return;

    const groups = await prisma.portonGroup.findMany({
      where: buildGroupScope(usuarioToken),
      include: {
        _count: {
          select: {
            gates: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      module: "portones",
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        gatesCount: group._count.gates,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/bot/modulos/portones/grupos/:grupoId/portones", authenticateBotSecret, async (req, res) => {
  const grupoId = Number(req.params.grupoId);
  if (Number.isNaN(grupoId)) {
    return res.status(400).json({ error: "grupoId inválido" });
  }

  try {
    const usuarioToken = await resolveBotUserOrFail(req, res);
    if (!usuarioToken) return;

    const group = await prisma.portonGroup.findFirst({
      where: {
        id: grupoId,
        ...buildGroupScope(usuarioToken),
      },
      select: { id: true, name: true },
    });
    if (!group) {
      return res.status(404).json({ error: "Grupo no encontrado o sin acceso" });
    }

    const gates = await prisma.gate.findMany({
      where: {
        portonGroupId: grupoId,
        isActive: true,
        deletedAt: null,
        ...buildGateScope(usuarioToken),
      },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      module: "portones",
      group,
      gates: gates.map((gate) => ({
        id: gate.id,
        name: gate.name,
        identifier: gate.identifier,
        state: gate.state,
        location: gate.location,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/bot/modulos/cultivos", authenticateBotSecret, async (req, res) => {
  try {
    const usuarioToken = await resolveBotUserOrFail(req, res);
    if (!usuarioToken) return;

    if (usuarioToken.role === USER_ROLES.OPERADOR) {
      return res.status(403).json({ error: "Sin acceso al módulo cultivos" });
    }

    const cultivos = await prisma.cultivo.findMany({
      where:
        usuarioToken.role === USER_ROLES.SUPERADMIN
          ? { isActive: true, deletedAt: null }
          : {
              accountId: Number(usuarioToken.account_id),
              isActive: true,
              deletedAt: null,
            },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      module: "cultivos",
      cultivos: cultivos.map((cultivo) => ({
        id: cultivo.id,
        nombre: cultivo.nombre,
        descripcion: cultivo.descripcion,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
