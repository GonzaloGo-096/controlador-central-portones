const express = require("express");
const { Prisma } = require("../../generated/prisma");
const service = require("./grupos_portones.service");
const { toJSONSafe } = require("../../shared/utils/serialization");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles, ADMIN_ACCESS_ROLES } = require("../../middleware/requireRoles");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const router = express.Router();

router.use(authenticateJwt);

router.get("/", async (req, res) => {
  const rows = await service.getGruposPortones(req.user);
  return res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const row = await service.getGrupoPortonesById(id, req.user);
  if (!row) return res.status(404).json({ error: "Grupo de portones no encontrado" });
  return res.status(200).json(toJSONSafe(row));
});

router.post("/", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      accountId: isSuperadmin(req.user)
        ? Number(body.accountId)
        : requireAccountId(req.user),
      name: String(body.name || ""),
      description: body.description != null ? String(body.description) : null,
      isActive: body.isActive !== false,
    };
    const created = await service.createGrupoPortones(payload, req.user);
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
  if (isSuperadmin(req.user) && body.accountId != null) payload.accountId = Number(body.accountId);
  if (body.name != null) payload.name = String(body.name);
  if (body.description != null) payload.description = String(body.description);
  if (body.isActive != null) payload.isActive = Boolean(body.isActive);
  if (body.deletedAt === null) payload.deletedAt = null;

  const updated = await service.updateGrupoPortones(id, payload, req.user);
  if (!updated) return res.status(404).json({ error: "Grupo de portones no encontrado" });
  return res.status(200).json(toJSONSafe(updated));
});

router.delete("/:id", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const deleted = await service.removeGrupoPortones(id, req.user);
  if (!deleted) return res.status(404).json({ error: "Grupo de portones no encontrado" });
  return res.status(200).json(toJSONSafe(deleted));
});

module.exports = router;
