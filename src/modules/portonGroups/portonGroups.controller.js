const express = require("express");
const { Prisma } = require("@prisma/client");
const service = require("./portonGroups.service");
const { toJSONSafe } = require("../../shared/utils/serialization");

const router = express.Router();

router.get("/", async (_req, res) => {
  const rows = await service.getPortonGroups();
  res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const row = await service.getPortonGroupById(id);
  if (!row) return res.status(404).json({ error: "PortonGroup no encontrado" });

  return res.status(200).json(toJSONSafe(row));
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createPortonGroup({
      accountId: Number(body.accountId),
      name: String(body.name || ""),
      description: body.description != null ? String(body.description) : null,
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

    if (body.accountId != null) payload.accountId = Number(body.accountId);
    if (body.name != null) payload.name = String(body.name);
    if (body.description != null) payload.description = String(body.description);
    if (body.isActive != null) payload.isActive = Boolean(body.isActive);
    if (body.deletedAt === null) payload.deletedAt = null;

    const updated = await service.updatePortonGroup(id, payload);
    return res.status(200).json(toJSONSafe(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "PortonGroup no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const deleted = await service.removePortonGroup(id);
    return res.status(200).json(toJSONSafe(deleted));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "PortonGroup no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
