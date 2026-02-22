const express = require("express");
const { Prisma } = require("../../generated/prisma");
const service = require("./gates.service");
const { toJSONSafe } = require("../../shared/utils/serialization");

const router = express.Router();

router.get("/", async (_req, res) => {
  const rows = await service.getGates();
  res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const row = await service.getGateById(id);
  if (!row) return res.status(404).json({ error: "Gate no encontrado" });

  return res.status(200).json(toJSONSafe(row));
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createGate({
      portonGroupId: Number(body.portonGroupId),
      name: String(body.name || ""),
      type: String(body.type || "vehicular"),
      identifier: body.identifier != null ? String(body.identifier) : null,
      topicMqtt: body.topicMqtt != null ? String(body.topicMqtt) : null,
      location: body.location != null ? String(body.location) : null,
      state: body.state != null ? String(body.state) : undefined,
      isActive: body.isActive !== false,
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

    if (body.portonGroupId != null) payload.portonGroupId = Number(body.portonGroupId);
    if (body.name != null) payload.name = String(body.name);
    if (body.type != null) payload.type = String(body.type);
    if (body.identifier != null) payload.identifier = String(body.identifier);
    if (body.topicMqtt != null) payload.topicMqtt = String(body.topicMqtt);
    if (body.location != null) payload.location = String(body.location);
    if (body.state != null) payload.state = String(body.state);
    if (body.isActive != null) payload.isActive = Boolean(body.isActive);
    if (body.deletedAt === null) payload.deletedAt = null;

    const updated = await service.updateGate(id, payload);
    return res.status(200).json(toJSONSafe(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Gate no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const deleted = await service.removeGate(id);
    return res.status(200).json(toJSONSafe(deleted));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "Gate no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
