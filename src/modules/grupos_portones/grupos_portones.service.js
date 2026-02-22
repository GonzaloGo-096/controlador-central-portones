const { ensureRedisConnection } = require("../../infrastructure/cache/redisClient");
const repository = require("./grupos_portones.repository");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const TTL_SECONDS = 600;
const BASE_KEY = "cache:grupos-portones:all";

function cacheKey(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return BASE_KEY;
  return `${BASE_KEY}:cuenta:${requireAccountId(usuarioToken)}`;
}

async function getGruposPortones(usuarioToken) {
  const key = cacheKey(usuarioToken);
  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const rows = await repository.findAllGruposPortones(usuarioToken);
    await redis.set(key, JSON.stringify(rows), { EX: TTL_SECONDS });
    return rows;
  } catch (_err) {
    return repository.findAllGruposPortones(usuarioToken);
  }
}

function getGrupoPortonesById(id, usuarioToken) {
  return repository.findGrupoPortonesById(id, usuarioToken);
}

async function createGrupoPortones(payload, usuarioToken) {
  const created = await repository.createGrupoPortones(payload);
  await invalidate(usuarioToken);
  return created;
}

async function updateGrupoPortones(id, payload, usuarioToken) {
  const updated = await repository.updateGrupoPortones(id, payload, usuarioToken);
  if (!updated) return null;
  await invalidate(usuarioToken);
  return updated;
}

async function removeGrupoPortones(id, usuarioToken) {
  const deleted = await repository.deleteGrupoPortones(id, usuarioToken);
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
  getGruposPortones,
  getGrupoPortonesById,
  createGrupoPortones,
  updateGrupoPortones,
  removeGrupoPortones,
};
