const { ensureRedisConnection } = require("../../infrastructure/cache/redisClient");
const repository = require("./gates.repository");

const GATES_LIST_CACHE_KEY = "cache:gates:all";

async function getGates() {
  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(GATES_LIST_CACHE_KEY);
    if (cached) {
      console.log("[gates] Cache hit");
      return JSON.parse(cached);
    }

    console.log("[gates] Cache miss");
    const gates = await repository.findAllGates();
    await redis.set(GATES_LIST_CACHE_KEY, JSON.stringify(gates), { EX: 600 });
    return gates;
  } catch (_err) {
    return repository.findAllGates();
  }
}

async function getGateById(id) {
  return repository.findGateById(id);
}

async function createGate(payload) {
  const created = await repository.createGate(payload);
  await invalidateGatesCache();
  return created;
}

async function updateGate(id, payload) {
  const updated = await repository.updateGate(id, payload);
  await invalidateGatesCache();
  return updated;
}

async function removeGate(id) {
  const deleted = await repository.deleteGate(id);
  await invalidateGatesCache();
  return deleted;
}

async function invalidateGatesCache() {
  try {
    const redis = await ensureRedisConnection();
    await redis.del(GATES_LIST_CACHE_KEY);
  } catch (_err) {
    // noop
  }
}

module.exports = {
  getGates,
  getGateById,
  createGate,
  updateGate,
  removeGate,
};
