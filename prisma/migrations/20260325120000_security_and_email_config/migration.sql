-- ConversaIA: suporte a pausa (humano assume controle)
ALTER TABLE "conversas_ia"
  ADD COLUMN IF NOT EXISTS "pausadaEm"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pausadoPorId" TEXT;

-- Escritorio: SMTP/IMAP configuráveis (antes hardcoded para Hostinger)
ALTER TABLE "escritorio"
  ADD COLUMN IF NOT EXISTS "emailSmtpHost" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSmtpPort" INTEGER,
  ADD COLUMN IF NOT EXISTS "emailImapHost" TEXT,
  ADD COLUMN IF NOT EXISTS "emailImapPort" INTEGER;
