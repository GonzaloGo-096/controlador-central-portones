-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('GATE', 'POT', 'ACTUATOR', 'TANK', 'LIGHT', 'SENSOR_GROUP');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_key" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "type" "DeviceType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_key_key" ON "devices"("device_key");

-- CreateIndex
CREATE INDEX "idx_devices_account_id" ON "devices"("account_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddColumn: device_id to gates (nullable first for backfill)
ALTER TABLE "gates" ADD COLUMN "device_id" UUID;

-- Backfill: create one Device per existing Gate and link it
INSERT INTO "devices" ("id", "device_key", "account_id", "type", "is_active", "created_at")
SELECT gen_random_uuid(), 'gate-' || g."id", p."account_id", 'GATE'::"DeviceType", true, CURRENT_TIMESTAMP
FROM "gates" g
JOIN "porton_groups" p ON g."porton_group_id" = p."id";

UPDATE "gates" g
SET "device_id" = d."id"
FROM "devices" d
WHERE d."device_key" = 'gate-' || g."id";

-- Make device_id NOT NULL
ALTER TABLE "gates" ALTER COLUMN "device_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_gates_device_id" ON "gates"("device_id");

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
