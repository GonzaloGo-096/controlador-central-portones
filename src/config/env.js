/**
 * Configuración desde variables de entorno.
 * No hardcodear valores.
 */

const mqtt = {
  brokerUrl: process.env.MQTT_BROKER_URL,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: process.env.MQTT_CLIENT_ID,
  testOnConnect: process.env.MQTT_TEST_ON_CONNECT === "true",
};

module.exports = {
  mqtt,
};
