-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_MASTER', 'MASTER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MASTER',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "emailVerificationCodeHash" TEXT,
    "emailVerificationCodeExpiresAt" TIMESTAMP(3),
    "passwordResetCodeHash" TEXT,
    "passwordResetCodeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
