const express = require("express");
const { Prisma } = require("@prisma/client");
const service = require("./users.service");
const { toJSONSafe } = require("../../shared/utils/serialization");

const router = express.Router();

router.get("/", async (_req, res) => {
  const rows = await service.getUsers();
  res.status(200).json(toJSONSafe(rows));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  const row = await service.getUserById(id);
  if (!row) return res.status(404).json({ error: "User no encontrado" });

  return res.status(200).json(toJSONSafe(row));
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const created = await service.createUser({
      accountId: Number(body.accountId),
      fullName: String(body.fullName || ""),
      email: body.email != null ? String(body.email) : null,
      role: body.role != null ? String(body.role) : undefined,
      permissionsVersion: body.permissionsVersion != null ? Number(body.permissionsVersion) : undefined,
      isActive: body.isActive !== false,
    });
    res.status(201).json(toJSONSafe(created));
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
    if (body.fullName != null) payload.fullName = String(body.fullName);
    if (body.email != null) payload.email = String(body.email);
    if (body.role != null) payload.role = String(body.role);
    if (body.permissionsVersion != null) payload.permissionsVersion = Number(body.permissionsVersion);
    if (body.isActive != null) payload.isActive = Boolean(body.isActive);
    if (body.deletedAt === null) payload.deletedAt = null;

    const updated = await service.updateUser(id, payload);
    return res.status(200).json(toJSONSafe(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "User no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const deleted = await service.removeUser(id);
    return res.status(200).json(toJSONSafe(deleted));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "User no encontrado" });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
