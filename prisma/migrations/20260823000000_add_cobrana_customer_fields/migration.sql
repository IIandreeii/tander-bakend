-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'CE', 'PAS', 'RUC');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'DNI',
ADD COLUMN     "name" TEXT,
ADD COLUMN     "lastname" TEXT;
