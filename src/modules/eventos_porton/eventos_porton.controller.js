const express = require("express");
const { Prisma } = require("@prisma/client");
const service = require("./eventos_porton.service");
const { toJSONSafe } = require("../../shared/utils/serialization");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles, ADMIN_ACCESS_ROLES } = require("../../middleware/requireRoles");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const router = express.Router();

router.use(authenticateJwt);

router.get("/", async (req, res) => {
  const rows = await service.getEventosPorton(req.user, req.query || {});
  return res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const row = await service.getEventoPortonById(id, req.user);
  if (!row) return res.status(404).json({ error: "Evento no encontrado" });
  return res.status(200).json(toJSONSafe(row));
});

router.post("/", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createEventoPorton({
      identityId: body.identityId != null ? String(body.identityId) : null,
      cuentaId: isSuperadmin(req.user)
        ? Number(body.cuentaId)
        : requireAccountId(req.user),
      portonId: Number(body.portonId),
      grupoPortonesId: Number(body.grupoPortonesId),
      accion: String(body.accion || "accion_manual"),
      canal: String(body.canal || "web"),
      fechaHora: body.fechaHora ? new Date(body.fechaHora) : undefined,
    });
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
  if (body.identityId != null) payload.identityId = String(body.identityId);
  if (isSuperadmin(req.user) && body.cuentaId != null) payload.cuentaId = Number(body.cuentaId);
  if (body.portonId != null) payload.portonId = Number(body.portonId);
  if (body.grupoPortonesId != null) payload.grupoPortonesId = Number(body.grupoPortonesId);
  if (body.accion != null) payload.accion = String(body.accion);
  if (body.canal != null) payload.canal = String(body.canal);
  if (body.fechaHora != null) payload.fechaHora = new Date(body.fechaHora);

  const updated = await service.updateEventoPorton(id, payload, req.user);
  if (!updated) return res.status(404).json({ error: "Evento no encontrado" });
  return res.status(200).json(toJSONSafe(updated));
});

router.delete("/:id", requireRoles(ADMIN_ACCESS_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const deleted = await service.removeEventoPorton(id, req.user);
  if (!deleted) return res.status(404).json({ error: "Evento no encontrado" });
  return res.status(200).json(toJSONSafe(deleted));
});

module.exports = router;
