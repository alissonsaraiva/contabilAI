-- AlterTable
ALTER TABLE "portal_tokens" ADD COLUMN     "otp" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3);
