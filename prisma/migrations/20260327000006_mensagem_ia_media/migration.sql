-- AddColumns: campos de mídia enviada pelo operador em MensagemIA
ALTER TABLE "mensagens_ia"
  ADD COLUMN "mediaUrl"      TEXT,
  ADD COLUMN "mediaType"     TEXT,
  ADD COLUMN "mediaFileName" TEXT,
  ADD COLUMN "mediaMimeType" TEXT;
