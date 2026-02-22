const path = require("path");
const { createClient } = require("redis");

if (!process.env.REDIS_URL && !process.env.RAILWAY_PUBLIC_DOMAIN) {
  require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: false,
  },
});

redisClient.on("connect", () => {
  console.log(`[redis] connect -> ${REDIS_URL}`);
});

redisClient.on("ready", () => {
  console.log("[redis] ready");
});

redisClient.on("error", (err) => {
  console.error("[redis] error:", formatRedisError(err));
});

let connectingPromise = null;

async function ensureRedisConnection() {
  if (redisClient.isReady) {
    return redisClient;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = redisClient
    .connect()
    .then(() => {
      console.log("[redis] conectado");
      return redisClient;
    })
    .catch((err) => {
      console.error("[redis] fallo al conectar:", formatRedisError(err));
      throw err;
    })
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

function formatRedisError(err) {
  if (!err) return "Error desconocido";
  if (typeof err.message === "string" && err.message.trim() !== "") {
    return err.message;
  }
  if (typeof err.code === "string" && err.code.trim() !== "") {
    return `code=${err.code}`;
  }
  return String(err);
}

module.exports = {
  redisClient,
  ensureRedisConnection,
  REDIS_URL,
  formatRedisError,
};
