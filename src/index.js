const path = require("path");
if (!process.env.RAILWAY_PUBLIC_DOMAIN) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
}
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL no está definida. Configurá la variable de entorno antes de iniciar la aplicación."
  );
}

const express = require("express");
const { prisma } = require("./infrastructure/database/prismaClient");
const { ensureRedisConnection, redisClient } = require("./infrastructure/cache/redisClient");
const authRouter = require("./modules/auth/auth.controller");
const usuariosRouter = require("./modules/usuarios/usuarios.controller");
const gruposPortonesRouter = require("./modules/grupos_portones/grupos_portones.controller");
const portonesRouter = require("./modules/portones/portones.controller");
const eventosPortonRouter = require("./modules/eventos_porton/eventos_porton.controller");
const cultivosRouter = require("./modules/cultivos/cultivos.controller");
const telegramRouter = require("./infrastructure/telegram/telegram.controller");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/grupos-portones", gruposPortonesRouter);
app.use("/api/portones", portonesRouter);
app.use("/api/eventos-porton", eventosPortonRouter);
app.use("/api/cultivos", cultivosRouter);
app.use("/api/telegram", telegramRouter);

const port = process.env.PORT || 3000;
const server = app.listen(port, async () => {
  console.log(`🌐 API base escuchando en puerto ${port}`);
  try {
    await ensureRedisConnection();
  } catch (err) {
    console.warn("[startup] Redis no disponible, se continuará sin cache:", err.message || err);
  }
});

async function gracefulShutdown() {
  console.log("🛑 Cerrando servicios...");
  server.close();
  await Promise.allSettled([
    prisma.$disconnect(),
    redisClient.isOpen ? redisClient.quit() : Promise.resolve(),
  ]);
  console.log("👋 Servidor detenido");
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
