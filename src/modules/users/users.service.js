const { ensureRedisConnection } = require("../../infrastructure/cache/redisClient");
const repository = require("./users.repository");

const USERS_LIST_CACHE_KEY = "cache:users:all";

function stringifyForCache(value) {
  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }
    return currentValue;
  });
}

async function getUsers() {
  try {
    const redis = await ensureRedisConnection();
    const cached = await redis.get(USERS_LIST_CACHE_KEY);
    if (cached) {
      console.log("[users] Cache hit");
      return JSON.parse(cached);
    }

    console.log("[users] Cache miss");
    const users = await repository.findAllUsers();
    await redis.set(USERS_LIST_CACHE_KEY, stringifyForCache(users), { EX: 600 });
    return users;
  } catch (_err) {
    return repository.findAllUsers();
  }
}

async function getUserById(id) {
  return repository.findUserById(id);
}

async function createUser(payload) {
  const created = await repository.createUser(payload);
  await invalidateUsersCache();
  return created;
}

async function updateUser(id, payload) {
  const updated = await repository.updateUser(id, payload);
  await invalidateUsersCache();
  return updated;
}

async function removeUser(id) {
  const deleted = await repository.deleteUser(id);
  await invalidateUsersCache();
  return deleted;
}

async function invalidateUsersCache() {
  try {
    const redis = await ensureRedisConnection();
    await redis.del(USERS_LIST_CACHE_KEY);
  } catch (_err) {
    // noop
  }
}

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  removeUser,
};
