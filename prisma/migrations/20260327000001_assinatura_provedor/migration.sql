-- Provedor de assinatura eletrônica e token ZapSign no Escritório
ALTER TABLE "escritorios" ADD COLUMN IF NOT EXISTS "provedorAssinatura" TEXT DEFAULT 'zapsign';
ALTER TABLE "escritorios" ADD COLUMN IF NOT EXISTS "zapsignToken"       TEXT;
