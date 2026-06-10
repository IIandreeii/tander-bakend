-- CreateEnum
CREATE TYPE "AliclikSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'ERROR');

-- CreateEnum
CREATE TYPE "AliclikSyncAction" AS ENUM ('QUOTE', 'CREATE', 'UPDATE', 'CONFIRM', 'RESCHEDULE', 'CANCEL', 'LOOKUP');

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "aliclikOrderNumber" TEXT,
ADD COLUMN "aliclikSyncStatus" "AliclikSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN "aliclikLastSyncAction" "AliclikSyncAction",
ADD COLUMN "aliclikLastSyncAttemptAt" TIMESTAMP(3),
ADD COLUMN "aliclikSyncedAt" TIMESTAMP(3),
ADD COLUMN "aliclikLastSyncError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_aliclikOrderNumber_key" ON "orders"("aliclikOrderNumber");
