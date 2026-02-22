const express = require("express");
const { Prisma } = require("../../generated/prisma");
const service = require("./portones.service");
const { toJSONSafe } = require("../../shared/utils/serialization");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles, ADMIN_ACCESS_ROLES } = require("../../middleware/requireRoles");
const { requireGateAccess } = require("../../middleware/requireGateAccess");
const { USER_ROLES } = require("../../shared/types/auth.types");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const router = express.Router();

router.use(authenticateJwt);

router.get("/", async (req, res) => {
  const rows = await service.getPortones(req.user);
  return res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const row = await service.getPortonById(id, req.user);
  if (!row) return res.status(404).json({ error: "Portón no encontrado" });
  return res.status(200).json(toJSONSafe(row));
});

router.post("/", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createPorton(
      {
        portonGroupId: Number(body.portonGroupId),
        name: String(body.name || ""),
        type: String(body.type || "vehicular"),
        identifier: body.identifier != null ? String(body.identifier) : null,
        topicMqtt: body.topicMqtt != null ? String(body.topicMqtt) : null,
        location: body.location != null ? String(body.location) : null,
        state: body.state != null ? String(body.state) : undefined,
        isActive: body.isActive !== false,
      },
      req.user
    );
    return res.status(201).json(toJSONSafe(created));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.put("/:id", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const body = req.body || {};
  const payload = {};
  if (body.portonGroupId != null) payload.portonGroupId = Number(body.portonGroupId);
  if (body.name != null) payload.name = String(body.name);
  if (body.type != null) payload.type = String(body.type);
  if (body.identifier != null) payload.identifier = String(body.identifier);
  if (body.topicMqtt != null) payload.topicMqtt = String(body.topicMqtt);
  if (body.location != null) payload.location = String(body.location);
  if (body.state != null) payload.state = String(body.state);
  if (body.isActive != null) payload.isActive = Boolean(body.isActive);
  if (body.deletedAt === null) payload.deletedAt = null;

  const updated = await service.updatePorton(id, payload, req.user);
  if (!updated) return res.status(404).json({ error: "Portón no encontrado" });
  return res.status(200).json(toJSONSafe(updated));
});

router.delete("/:id", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const deleted = await service.removePorton(id, req.user);
  if (!deleted) return res.status(404).json({ error: "Portón no encontrado" });
  return res.status(200).json(toJSONSafe(deleted));
});

router.post(
  "/:id/abrir",
  requireRoles([USER_ROLES.SUPERADMIN, USER_ROLES.ADMIN_CUENTA, USER_ROLES.OPERADOR]),
  requireGateAccess((req) => req.params.id, { permission: "open" }),
  async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

    try {
      const canal = String(req.body?.canal || "web");
      const result = await service.abrirPortonConDebounce({
        portonId: id,
        usuarioToken: req.user,
        canal,
      });
      if (result.notFound) return res.status(404).json({ error: "Portón no encontrado" });
      if (result.debounced) {
        return res.status(429).json({ error: "Comando bloqueado por debounce" });
      }

      return res.status(200).json({
        ok: true,
        mensaje: "Comando de apertura enviado (press)",
        accountId: isSuperadmin(req.user) ? undefined : requireAccountId(req.user),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
