/**
 * Controlador HTTP para el bot de Telegram.
 * Usa Identity + AccountMembership (modelo multi-tenant).
 */

const express = require("express");
const { prisma } = require("../database/prismaClient");
const {
  resolveIdentityFromTelegramId,
  getMemberships,
  isPortonesEnabledForMembership,
  isCultivosEnabledForMembership,
  buildPortonGroupScopeForMembership,
  buildCultivoScopeForMembership,
  buildGateScopeForMembership,
  MEMBERSHIP_ROLES,
} = require("../../modules/identity/identity.telegram.service");

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
  return String(raw).trim();
}

/**
 * Resuelve Identity y membership activo. Responde con error si falla.
 * @returns {Promise<{ identity, activeMembership, requiresAccountSelection, memberships } | null>}
 */
async function resolveBotIdentityOrFail(req, res) {
  const telegramId = getTelegramIdFromRequest(req);
  if (!telegramId) {
    res.status(400).json({ error: "telegramId es requerido" });
    return null;
  }

  const resolved = await resolveIdentityFromTelegramId(telegramId);
  if (!resolved) {
    res.status(404).json({ error: "Usuario de Telegram no encontrado o inactivo" });
    return null;
  }

  const { identity, memberships } = resolved;
  const { activeMembership, requiresAccountSelection } = await getMemberships(identity.id);

  if (requiresAccountSelection) {
    return {
      identity,
      activeMembership: null,
      requiresAccountSelection: true,
      memberships: memberships.map((m) => ({
        accountId: m.accountId,
        accountName: m.account?.name,
        role: m.role,
      })),
    };
  }

  if (!activeMembership) {
    res.status(404).json({ error: "Sin membership activo en ninguna cuenta" });
    return null;
  }

  return {
    identity,
    activeMembership,
    requiresAccountSelection: false,
    memberships: [],
  };
}

// GET /bot/menu
router.get("/bot/menu", authenticateBotSecret, async (req, res) => {
  try {
    const ctx = await resolveBotIdentityOrFail(req, res);
    if (!ctx) return;

    if (ctx.requiresAccountSelection) {
      return res.status(200).json({
        requiresAccountSelection: true,
        message: "Tenés más de una cuenta, seleccioná una (pendiente)",
        memberships: ctx.memberships,
        modules: [],
      });
    }

    const { identity, activeMembership } = ctx;
    const portonesEnabled = await isPortonesEnabledForMembership(activeMembership);
    const cultivosEnabled = await isCultivosEnabledForMembership(activeMembership);

    return res.status(200).json({
      user: {
        id: identity.id,
        fullName: identity.fullName,
        accountId: activeMembership.accountId,
        accountName: activeMembership.account?.name,
        role: activeMembership.role,
      },
      requiresAccountSelection: false,
      modules: [
        { key: "portones", label: "Portones", enabled: portonesEnabled },
        { key: "cultivos", label: "Cultivos", enabled: cultivosEnabled },
      ],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /bot/modulos/portones/grupos
router.get("/bot/modulos/portones/grupos", authenticateBotSecret, async (req, res) => {
  try {
    const ctx = await resolveBotIdentityOrFail(req, res);
    if (!ctx) return;

    if (ctx.requiresAccountSelection) {
      return res.status(400).json({
        error: "Selección de cuenta requerida",
        requiresAccountSelection: true,
      });
    }

    const scope = buildPortonGroupScopeForMembership(ctx.activeMembership);
    if (scope.id === -1) {
      return res.status(200).json({ module: "portones", groups: [] });
    }

    const groups = await prisma.portonGroup.findMany({
      where: scope,
      include: { _count: { select: { gates: true } } },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      module: "portones",
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        gatesCount: g._count.gates,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /bot/modulos/portones/grupos/:grupoId/portones
router.get("/bot/modulos/portones/grupos/:grupoId/portones", authenticateBotSecret, async (req, res) => {
  const grupoId = Number(req.params.grupoId);
  if (Number.isNaN(grupoId)) {
    return res.status(400).json({ error: "grupoId inválido" });
  }

  try {
    const ctx = await resolveBotIdentityOrFail(req, res);
    if (!ctx) return;

    if (ctx.requiresAccountSelection) {
      return res.status(400).json({
        error: "Selección de cuenta requerida",
        requiresAccountSelection: true,
      });
    }

    const groupScope = buildPortonGroupScopeForMembership(ctx.activeMembership);
    const membership = ctx.activeMembership;

    if (groupScope.id === -1) {
      return res.status(404).json({ error: "Grupo no encontrado o sin acceso" });
    }

    const groupWhere = {
      id: grupoId,
      isActive: true,
      deletedAt: null,
    };
    if (groupScope.accountId) groupWhere.accountId = groupScope.accountId;
    if (groupScope.id && typeof groupScope.id === "object" && groupScope.id.in) {
      if (!groupScope.id.in.includes(grupoId)) {
        return res.status(404).json({ error: "Grupo no encontrado o sin acceso" });
      }
    }

    const group = await prisma.portonGroup.findFirst({
      where: groupWhere,
      select: { id: true, name: true },
    });

    if (!group) {
      return res.status(404).json({ error: "Grupo no encontrado o sin acceso" });
    }

    let gateWhere = {
      portonGroupId: grupoId,
      isActive: true,
      deletedAt: null,
    };

    if (ctx.activeMembership.role === MEMBERSHIP_ROLES.OPERATOR) {
      const groupIds = (ctx.activeMembership.portonGroups || []).map((g) => g.portonGroupId);
      const gateIds = (ctx.activeMembership.gatePermissions || []).map((gp) => gp.gateId);
      if (groupIds.includes(grupoId)) {
        // Tiene acceso al grupo completo
      } else if (gateIds.length > 0) {
        gateWhere.id = { in: gateIds };
      } else {
        gateWhere.id = -1;
      }
    }

    const gates = await prisma.gate.findMany({
      where: gateWhere,
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      module: "portones",
      group,
      gates: gates.map((g) => ({
        id: g.id,
        name: g.name,
        identifier: g.identifier,
        state: g.state,
        location: g.location,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /bot/modulos/cultivos
router.get("/bot/modulos/cultivos", authenticateBotSecret, async (req, res) => {
  try {
    const ctx = await resolveBotIdentityOrFail(req, res);
    if (!ctx) return;

    if (ctx.requiresAccountSelection) {
      return res.status(400).json({
        error: "Selección de cuenta requerida",
        requiresAccountSelection: true,
      });
    }

    const scope = buildCultivoScopeForMembership(ctx.activeMembership);
    if (scope.id === -1) {
      return res.status(403).json({ error: "Sin acceso al módulo cultivos" });
    }

    const cultivos = await prisma.cultivo.findMany({
      where: scope,
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      module: "cultivos",
      cultivos: cultivos.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /bot/modulos/cultivos/:cultivoId/macetas
router.get("/bot/modulos/cultivos/:cultivoId/macetas", authenticateBotSecret, async (req, res) => {
  const cultivoId = parseInt(req.params.cultivoId, 10);
  if (Number.isNaN(cultivoId) || cultivoId <= 0) {
    return res.status(400).json({ error: "cultivoId inválido" });
  }

  try {
    const ctx = await resolveBotIdentityOrFail(req, res);
    if (!ctx) return;

    if (ctx.requiresAccountSelection) {
      return res.status(400).json({
        error: "Selección de cuenta requerida",
        requiresAccountSelection: true,
      });
    }

    const scope = buildCultivoScopeForMembership(ctx.activeMembership);
    if (scope.id === -1) {
      return res.status(403).json({ error: "Sin acceso al módulo cultivos" });
    }

    const cultivoWhere = {
      id: cultivoId,
      ...scope,
      isActive: true,
      deletedAt: null,
    };

    const cultivo = await prisma.cultivo.findFirst({
      where: cultivoWhere,
      select: { id: true, nombre: true },
    });

    if (!cultivo) {
      return res.status(404).json({ error: "Cultivo no encontrado o sin acceso" });
    }

    const macetas = await prisma.maceta.findMany({
      where: {
        cultivoId: cultivo.id,
        isActive: true,
      },
      orderBy: { nombre: "asc" },
    });

    return res.status(200).json({
      module: "cultivos",
      cultivo: { id: cultivo.id, nombre: cultivo.nombre },
      macetas: macetas.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        identificador: m.identificador,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /bot/portones/:id/abrir
router.post("/bot/portones/:id/abrir", authenticateBotSecret, async (req, res) => {
  try {
    const portonId = Number(req.params.id);
    if (Number.isNaN(portonId)) {
      return res.status(400).json({ error: "id inválido" });
    }
    const ctx = await resolveBotIdentityOrFail(req, res);
    if (!ctx) return;
    if (ctx.requiresAccountSelection) {
      return res.status(400).json({ error: "Selección de cuenta requerida" });
    }
    const { hasOpenAccess } = require("../../modules/identity/identity.telegram.service");
    const allowed = await hasOpenAccess(ctx.activeMembership, portonId);
    if (!allowed) {
      return res.status(403).json({ error: "Sin permiso para abrir este portón" });
    }
    const roleMap = { SUPERADMIN: "superadministrador", ADMIN: "administrador_cuenta", OPERATOR: "operador" };
    const usuarioToken = {
      sub: ctx.identity.id,
      account_id: ctx.activeMembership.accountId,
      role: roleMap[ctx.activeMembership.role] || ctx.activeMembership.role,
      membershipId: ctx.activeMembership.id,
    };
    const portonesService = require("../../modules/portones/portones.service");
    const result = await portonesService.abrirPortonConDebounce({
      portonId,
      usuarioToken,
      canal: "telegram",
    });
    if (result.notFound) return res.status(404).json({ error: "Portón no encontrado" });
    if (result.debounced) return res.status(429).json({ error: "Esperá unos segundos" });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /bot/portones/:id/abrir] Error 500:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    return res.status(500).json({ error: "Error al abrir el portón" });
  }
});

module.exports = router;
