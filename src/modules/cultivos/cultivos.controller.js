const express = require("express");
const { Prisma } = require("../../generated/prisma");
const service = require("./cultivos.service");
const { toJSONSafe } = require("../../shared/utils/serialization");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles, ADMIN_ACCESS_ROLES } = require("../../middleware/requireRoles");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const router = express.Router();

router.use(authenticateJwt);
router.use(requireRoles(ADMIN_ACCESS_ROLES));

router.get("/", async (req, res) => {
  const rows = await service.getCultivos(req.user);
  return res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const row = await service.getCultivoById(id, req.user);
  if (!row) return res.status(404).json({ error: "Cultivo no encontrado" });
  return res.status(200).json(toJSONSafe(row));
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createCultivo(
      {
        accountId: isSuperadmin(req.user)
          ? Number(body.accountId)
          : requireAccountId(req.user),
        nombre: String(body.nombre || ""),
        descripcion: body.descripcion != null ? String(body.descripcion) : null,
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

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const body = req.body || {};
  const payload = {};
  if (isSuperadmin(req.user) && body.accountId != null) payload.accountId = Number(body.accountId);
  if (body.nombre != null) payload.nombre = String(body.nombre);
  if (body.descripcion != null) payload.descripcion = String(body.descripcion);
  if (body.isActive != null) payload.isActive = Boolean(body.isActive);
  if (body.deletedAt === null) payload.deletedAt = null;

  const updated = await service.updateCultivo(id, payload, req.user);
  if (!updated) return res.status(404).json({ error: "Cultivo no encontrado" });
  return res.status(200).json(toJSONSafe(updated));
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const deleted = await service.removeCultivo(id, req.user);
  if (!deleted) return res.status(404).json({ error: "Cultivo no encontrado" });
  return res.status(200).json(toJSONSafe(deleted));
});

module.exports = router;
