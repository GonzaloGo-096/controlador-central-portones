const { prisma } = require("../database/prismaClient");
const { ensureRedisConnection, formatRedisError } = require("./redisClient");

const SENSOR_TTL_SECONDS = 300;
const USERS_CACHE_TTL_SECONDS = 600;

function sensorLatestKey(sensorId) {
  return `sensor:${sensorId}:latest`;
}

function sensorHistoryKey(sensorId) {
  return `sensor:${sensorId}:history`;
}

function stringifyForCache(value) {
  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }
    return currentValue;
  });
}

async function saveLatestSensorReading(sensorId, reading) {
  try {
    const redis = await ensureRedisConnection();
    const key = sensorLatestKey(sensorId);
  const payload = stringifyForCache(reading);

    await redis.set(key, payload, {
      EX: SENSOR_TTL_SECONDS,
    });
    console.log(`[redis] Lectura guardada (latest): ${key}`);
    return true;
  } catch (err) {
    console.warn("[redis] No se pudo guardar latest:", formatRedisError(err));
    return false;
  }
}

async function appendSensorHistory(sensorId, reading, maxItems = 500) {
  try {
    const redis = await ensureRedisConnection();
    const key = sensorHistoryKey(sensorId);
    const payload = stringifyForCache(reading);

    await redis.lPush(key, payload);
    await redis.lTrim(key, 0, maxItems - 1);
    console.log(`[redis] Lectura agregada al histórico: ${key}`);
    return true;
  } catch (err) {
    console.warn("[redis] No se pudo agregar al histórico:", formatRedisError(err));
    return false;
  }
}

async function getSensorHistory(sensorId, start = 0, stop = 49) {
  try {
    const redis = await ensureRedisConnection();
    const key = sensorHistoryKey(sensorId);

    const rows = await redis.lRange(key, start, stop);
    const parsed = rows.map((row) => {
      try {
        return JSON.parse(row);
      } catch (err) {
        return { raw: row, parseError: true };
      }
    });

    console.log(`[redis] Histórico leído: ${key} (${parsed.length} items)`);
    return parsed;
  } catch (err) {
    console.warn("[redis] No se pudo leer histórico:", formatRedisError(err));
    return [];
  }
}

async function getIdentitiesWithCache() {
  const cacheKey = "cache:identities:all";

  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("[cache] Cache hit: identities");
      return JSON.parse(cached);
    }

    console.log("[cache] Cache miss: identities. Consultando PostgreSQL...");
    const identities = await prisma.identity.findMany({
      orderBy: { id: "asc" },
    });

    await redis.set(cacheKey, stringifyForCache(identities), {
      EX: USERS_CACHE_TTL_SECONDS,
    });
    console.log("[cache] identities guardados en Redis (TTL 10 min)");

    return identities;
  } catch (err) {
    console.warn("[cache] Redis no disponible, fallback a PostgreSQL:", formatRedisError(err));
    return prisma.identity.findMany({
      orderBy: { id: "asc" },
    });
  }
}

module.exports = {
  saveLatestSensorReading,
  appendSensorHistory,
  getSensorHistory,
  getIdentitiesWithCache,
};
