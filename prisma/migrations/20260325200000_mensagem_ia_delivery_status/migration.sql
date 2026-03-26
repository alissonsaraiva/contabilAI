-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('pending', 'sent', 'failed');

-- AlterTable
ALTER TABLE "mensagens_ia"
  ADD COLUMN "status"     "StatusMensagem" NOT NULL DEFAULT 'pending',
  ADD COLUMN "tentativas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "erroEnvio"  TEXT;
