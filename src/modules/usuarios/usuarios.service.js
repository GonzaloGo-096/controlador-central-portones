const { ensureRedisConnection } = require("../../infrastructure/cache/redisClient");
const repository = require("./usuarios.repository");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const TTL_SECONDS = 600;
const BASE_KEY = "cache:usuarios:all";

function cacheKey(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return BASE_KEY;
  return `${BASE_KEY}:cuenta:${requireAccountId(usuarioToken)}`;
}

async function getUsuarios(usuarioToken) {
  const key = cacheKey(usuarioToken);
  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const rows = await repository.findAllUsuarios(usuarioToken);
    await redis.set(key, JSON.stringify(rows), { EX: TTL_SECONDS });
    return rows;
  } catch (_err) {
    return repository.findAllUsuarios(usuarioToken);
  }
}

function getUsuarioById(id, usuarioToken) {
  return repository.findUsuarioById(id, usuarioToken);
}

async function createUsuario(payload, usuarioToken) {
  const created = await repository.createUsuario(payload);
  await invalidate(usuarioToken);
  return created;
}

async function updateUsuario(id, payload, usuarioToken) {
  const updated = await repository.updateUsuario(id, payload, usuarioToken);
  if (!updated) return null;
  await invalidate(usuarioToken);
  return updated;
}

async function removeUsuario(id, usuarioToken) {
  const deleted = await repository.deleteUsuario(id, usuarioToken);
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
  getUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  removeUsuario,
};
