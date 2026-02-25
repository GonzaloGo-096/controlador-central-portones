require("dotenv").config();
const mqtt = require("mqtt");

console.log("PASSWORD LEIDA:", process.env.MQTT_PASSWORD);

const client = mqtt.connect(
  "mqtts://b95a357c965747e1904adf9c0d54ce14.s1.eu.hivemq.cloud:8883",
  {
    username: "controlador-portones",
    password: process.env.MQTT_PASSWORD,
    clientId: "backend-test-local",
    reconnectPeriod: 0,
  }
);

client.on("connect", () => {
  console.log("CONNECTED");
  client.end();
});

client.on("error", (err) => {
  console.error("ERROR:", err.message);
});