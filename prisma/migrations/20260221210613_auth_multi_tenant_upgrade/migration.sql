-- DropForeignKey
ALTER TABLE "user_credentials" DROP CONSTRAINT "user_credentials_user_id_fkey";

-- AlterTable
ALTER TABLE "user_credentials" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
