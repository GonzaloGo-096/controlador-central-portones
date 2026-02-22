const express = require("express");
const { Prisma } = require("@prisma/client");
const service = require("./events.service");
const { toJSONSafe } = require("../../shared/utils/serialization");

const router = express.Router();

router.get("/", async (_req, res) => {
  const rows = await service.getEvents();
  res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const row = await service.getEventById(id);
  if (!row) return res.status(404).json({ error: "Evento no encontrado" });

  return res.status(200).json(toJSONSafe(row));
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createEvent({
      gateId: Number(body.gateId),
      userId: body.userId != null ? Number(body.userId) : null,
      action: String(body.action || "pulse"),
    });
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

    if (body.gateId != null) payload.gateId = Number(body.gateId);
    if (body.userId != null) payload.userId = Number(body.userId);
    if (body.action != null) payload.action = String(body.action);

    const updated = await service.updateEvent(id, payload);
    return res.status(200).json(toJSONSafe(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Evento no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const deleted = await service.removeEvent(id);
    return res.status(200).json(toJSONSafe(deleted));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Evento no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
