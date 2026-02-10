/**
 * Punto de arranque del Controlador Central de Portones.
 *
 * Responsabilidades (según README):
 * - Inicializa módulos
 * - Orquesta dependencias
 * - Sin imports circulares: FSM no conoce MQTT, MQTT recibe FSM por inyección
 */

const path = require("path");
// En Railway no cargar .env: usar solo las variables inyectadas por el panel (así DATABASE_URL no se pisa).
if (!process.env.RAILWAY_PUBLIC_DOMAIN) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
}

const express = require("express");
const { StateMachine, STATES } = require("./core/stateMachine");
const { dispatch } = require("./core/actionDispatcher");
const { createMqttClient } = require("./mqtt/mqttClient");
const { createEventsRouter } = require("./api/events.controller");
const { createTelegramCommandRouter } = require("./api/telegram.command.controller");
const telegramRouter = require("./api/telegram.controller");
const prodDbTestRouter = require("./api/prodDbTest");
const { mqtt: mqttConfig } = require("./config/env");

console.log("🚀 Controlador Central de Portones iniciado");

// Validar configuración antes de conectar
if (!mqttConfig.brokerUrl) {
  console.error("\n❌ MQTT_BROKER_URL no está configurado.");
  console.error("   Creá un archivo .env con:");
  console.error("   MQTT_BROKER_URL=mqtts://tu-cluster.s1.eu.hivemq.cloud:8883");
  console.error("   MQTT_USERNAME=tu_usuario");
  console.error("   MQTT_PASSWORD=tu_contraseña\n");
  process.exit(1);
}

if (mqttConfig.brokerUrl.startsWith("mqtts://") && (!mqttConfig.username || !mqttConfig.password)) {
  console.error("\n❌ HiveMQ Cloud requiere MQTT_USERNAME y MQTT_PASSWORD en .env\n");
  process.exit(1);
}

// Registro de FSM por portón (un estado lógico por portonId)
const stateMachineRegistry = new Map();

function getStateMachine(portonId) {
  if (!stateMachineRegistry.has(portonId)) {
    stateMachineRegistry.set(portonId, new StateMachine(STATES.CLOSED));
    console.log(`📍 [${portonId}] FSM creada, estado inicial: CLOSED`);
  }
  return stateMachineRegistry.get(portonId);
}

const onStateChange = (portonId, result) => dispatch(portonId, result, mqttClient);

const mqttClient = createMqttClient(mqttConfig, getStateMachine, onStateChange);

try {
  mqttClient.connect();
} catch (err) {
  console.error("❌ Error al conectar MQTT:", err.message);
  process.exit(1);
}

// Servidor HTTP con Express
const app = express();
app.use(express.json());
app.get("/api/ping", (req, res) => res.json({ ok: true, service: "controlador-portones" }));
app.use("/api", prodDbTestRouter);
app.use("/api", createEventsRouter(getStateMachine, onStateChange));
app.use("/api", createTelegramCommandRouter(getStateMachine, onStateChange));
app.use("/api", telegramRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 HTTP API escuchando en puerto ${port}`);
  console.log(`   POST /api/events - Enviar evento { portonId, event, timestamp? }`);
});

// Graceful shutdown (Ctrl+C en Windows)
process.on("SIGINT", () => {
  mqttClient.disconnect();
  console.log("👋 Servidor detenido");
  process.exit(0);
});
