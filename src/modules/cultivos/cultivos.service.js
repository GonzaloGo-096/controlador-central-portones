const { ensureRedisConnection } = require("../../infrastructure/cache/redisClient");
const repository = require("./cultivos.repository");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const TTL_SECONDS = 600;
const BASE_KEY = "cache:cultivos:all";

function cacheKey(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return BASE_KEY;
  return `${BASE_KEY}:cuenta:${requireAccountId(usuarioToken)}`;
}

async function getCultivos(usuarioToken) {
  const key = cacheKey(usuarioToken);
  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const rows = await repository.findAllCultivos(usuarioToken);
    await redis.set(key, JSON.stringify(rows), { EX: TTL_SECONDS });
    return rows;
  } catch (_err) {
    return repository.findAllCultivos(usuarioToken);
  }
}

function getCultivoById(id, usuarioToken) {
  return repository.findCultivoById(id, usuarioToken);
}

async function createCultivo(payload, usuarioToken) {
  const created = await repository.createCultivo(payload);
  await invalidate(usuarioToken);
  return created;
}

async function updateCultivo(id, payload, usuarioToken) {
  const updated = await repository.updateCultivo(id, payload, usuarioToken);
  if (!updated) return null;
  await invalidate(usuarioToken);
  return updated;
}

async function removeCultivo(id, usuarioToken) {
  const deleted = await repository.deleteCultivo(id, usuarioToken);
  if (!deleted) return null;
  await invalidate(usuarioToken);
  return deleted;
}

async function invalidate(usuarioToken) {
  try {
    const redis = await ensureRedisConnection();
    await redis.del(cacheKey(usuarioToken));
  } catch (_err) {
    // noop
  }
}

module.exports = {
  getCultivos,
  getCultivoById,
  createCultivo,
  updateCultivo,
  removeCultivo,
};
