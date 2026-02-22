const { ensureRedisConnection } = require("../../infrastructure/cache/redisClient");
const repository = require("./portones.repository");
const eventosRepository = require("../eventos_porton/eventos_porton.repository");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

const TTL_SECONDS = 600;
const BASE_KEY = "cache:portones:all";

function cacheKey(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return BASE_KEY;
  return `${BASE_KEY}:cuenta:${requireAccountId(usuarioToken)}`;
}

async function getPortones(usuarioToken) {
  const key = cacheKey(usuarioToken);
  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const rows = await repository.findAllPortones(usuarioToken);
    await redis.set(key, JSON.stringify(rows), { EX: TTL_SECONDS });
    return rows;
  } catch (_err) {
    return repository.findAllPortones(usuarioToken);
  }
}

function getPortonById(id, usuarioToken) {
  return repository.findPortonById(id, usuarioToken);
}

async function createPorton(payload, usuarioToken) {
  const created = await repository.createPorton(payload);
  await invalidate(usuarioToken);
  return created;
}

async function updatePorton(id, payload, usuarioToken) {
  const updated = await repository.updatePorton(id, payload, usuarioToken);
  if (!updated) return null;
  await invalidate(usuarioToken);
  return updated;
}

async function removePorton(id, usuarioToken) {
  const deleted = await repository.deletePorton(id, usuarioToken);
  if (!deleted) return null;
  await invalidate(usuarioToken);
  return deleted;
}

async function abrirPortonConDebounce({ portonId, usuarioToken, canal }) {
  const porton = await repository.findPortonById(portonId, usuarioToken);
  if (!porton) return { notFound: true };

  const redis = await ensureRedisConnection();
  const debounceKey = `debounce:porton:abrir:${portonId}`;
  const debounceResult = await redis.set(debounceKey, "1", { EX: 2, NX: true });
  if (debounceResult !== "OK") {
    return { debounced: true };
  }

  const cuentaId = isSuperadmin(usuarioToken)
    ? porton.portonGroup.accountId
    : requireAccountId(usuarioToken);

  await eventosRepository.createEventoPorton({
    usuarioId: Number(usuarioToken.sub),
    cuentaId,
    portonId: porton.id,
    grupoPortonesId: porton.portonGroupId,
    accion: "abrir_press",
    canal: canal || "web",
  });

  // La apertura es un press simple. FSM no aplicada por requerimiento.
  return { ok: true };
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
  getPortones,
  getPortonById,
  createPorton,
  updatePorton,
  removePorton,
  abrirPortonConDebounce,
};
