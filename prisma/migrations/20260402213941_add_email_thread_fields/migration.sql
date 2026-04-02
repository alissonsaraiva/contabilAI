-- AlterTable
ALTER TABLE "interacoes" ADD COLUMN     "emailInReplyTo" TEXT,
ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "emailThreadId" TEXT;

-- CreateIndex
CREATE INDEX "interacoes_emailThreadId_criadoEm_idx" ON "interacoes"("emailThreadId", "criadoEm");

-- CreateIndex
CREATE INDEX "interacoes_emailMessageId_idx" ON "interacoes"("emailMessageId");
