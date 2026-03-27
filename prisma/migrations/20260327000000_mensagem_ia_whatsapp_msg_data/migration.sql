-- Add whatsappMsgData column to mensagens_ia (payload para re-fetch de mídia na Evolution)
ALTER TABLE "mensagens_ia" ADD COLUMN IF NOT EXISTS "whatsappMsgData" JSONB;
