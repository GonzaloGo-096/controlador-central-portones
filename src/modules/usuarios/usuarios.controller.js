const express = require("express");
const { Prisma } = require("../../generated/prisma");
const service = require("./usuarios.service");
const { toJSONSafe } = require("../../shared/utils/serialization");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles, ADMIN_ACCESS_ROLES } = require("../../middleware/requireRoles");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const router = express.Router();

router.use(authenticateJwt);
router.use(requireRoles(ADMIN_ACCESS_ROLES));

router.get("/", async (req, res) => {
  const rows = await service.getUsuarios(req.user);
  return res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const row = await service.getUsuarioById(id, req.user);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
  return res.status(200).json(toJSONSafe(row));
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      accountId: isSuperadmin(req.user)
        ? Number(body.accountId)
        : requireAccountId(req.user),
      fullName: String(body.fullName || ""),
      email: body.email != null ? String(body.email) : null,
      role: body.role != null ? String(body.role) : undefined,
      permissionsVersion:
        body.permissionsVersion != null ? Number(body.permissionsVersion) : undefined,
      isActive: body.isActive !== false,
    };
    const created = await service.createUsuario(payload, req.user);
    return res.status(201).json(toJSONSafe(created));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const body = req.body || {};
    const payload = {};
    if (isSuperadmin(req.user) && body.accountId != null) payload.accountId = Number(body.accountId);
    if (body.fullName != null) payload.fullName = String(body.fullName);
    if (body.email != null) payload.email = String(body.email);
    if (body.role != null) payload.role = String(body.role);
    if (body.permissionsVersion != null) payload.permissionsVersion = Number(body.permissionsVersion);
    if (body.isActive != null) payload.isActive = Boolean(body.isActive);
    if (body.deletedAt === null) payload.deletedAt = null;

    const updated = await service.updateUsuario(id, payload, req.user);
    if (!updated) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.status(200).json(toJSONSafe(updated));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const deleted = await service.removeUsuario(id, req.user);
  if (!deleted) return res.status(404).json({ error: "Usuario no encontrado" });
  return res.status(200).json(toJSONSafe(deleted));
});

module.exports = router;
