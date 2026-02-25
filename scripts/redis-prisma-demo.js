const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { prisma } = require("../src/infrastructure/database/prismaClient");
const { redisClient } = require("../src/infrastructure/cache/redisClient");
const {
  saveLatestSensorReading,
  appendSensorHistory,
  getSensorHistory,
  getIdentitiesWithCache,
} = require("../src/infrastructure/cache/cacheExamples");

async function run() {
  const sensorId = "cultivo_1:temperatura";
  const now = new Date().toISOString();
  const reading = {
    sensorId,
    value: 24.6,
    unit: "C",
    timestamp: now,
  };

  await saveLatestSensorReading(sensorId, reading);
  await appendSensorHistory(sensorId, reading);
  await appendSensorHistory(sensorId, {
    ...reading,
    value: 24.9,
    timestamp: new Date(Date.now() + 1000).toISOString(),
  });

  const history = await getSensorHistory(sensorId, 0, 10);
  console.log("[demo] Histórico parseado:", history);

  const identities1 = await getIdentitiesWithCache();
  console.log(`[demo] identities (primera llamada): ${identities1.length}`);

  const identities2 = await getIdentitiesWithCache();
  console.log(`[demo] identities (segunda llamada, cache esperada): ${identities2.length}`);
}

run()
  .catch((err) => {
    console.error("[demo] Error:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      redisClient.isOpen ? redisClient.quit() : Promise.resolve(),
      prisma.$disconnect(),
    ]);
  });
