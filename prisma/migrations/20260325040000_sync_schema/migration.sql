Loaded Prisma config from prisma.config.ts.

-- CreateEnum
CREATE TYPE "StatusEscalacao" AS ENUM ('pendente', 'em_atendimento', 'resolvida');

-- CreateEnum
CREATE TYPE "CanalEscalacao" AS ENUM ('whatsapp', 'onboarding');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoInteracao" ADD VALUE 'email_recebido';
ALTER TYPE "TipoInteracao" ADD VALUE 'ia_escalada';
ALTER TYPE "TipoInteracao" ADD VALUE 'humano_respondeu';

-- AlterTable
ALTER TABLE "escritorio" DROP COLUMN "aimodelcrm",
DROP COLUMN "aimodelonboarding",
DROP COLUMN "aimodelportal",
DROP COLUMN "aiprovider",
DROP COLUMN "anthropicapikey",
DROP COLUMN "evolutionapikey",
DROP COLUMN "evolutionapiurl",
DROP COLUMN "evolutioninstance",
DROP COLUMN "openaiapikey",
DROP COLUMN "openaibaseurl",
DROP COLUMN "openaimodel",
DROP COLUMN "systempromptcrm",
DROP COLUMN "systempromptonboarding",
DROP COLUMN "systempromptportal",
DROP COLUMN "systempromptwhatsapp",
DROP COLUMN "voyageapikey",
DROP COLUMN "whatsappaienabled",
DROP COLUMN "whatsappaifeature",
ADD COLUMN     "aiModelCrm" TEXT DEFAULT 'claude-haiku-4-5-20251001',
ADD COLUMN     "aiModelOnboarding" TEXT DEFAULT 'claude-haiku-4-5-20251001',
ADD COLUMN     "aiModelPortal" TEXT DEFAULT 'claude-haiku-4-5-20251001',
ADD COLUMN     "aiModelWhatsapp" TEXT DEFAULT 'claude-haiku-4-5-20251001',
ADD COLUMN     "aiProvider" TEXT DEFAULT 'claude',
ADD COLUMN     "aiProviderCrm" TEXT DEFAULT 'claude',
ADD COLUMN     "aiProviderOnboarding" TEXT DEFAULT 'claude',
ADD COLUMN     "aiProviderPortal" TEXT DEFAULT 'claude',
ADD COLUMN     "aiProviderWhatsapp" TEXT DEFAULT 'claude',
ADD COLUMN     "anthropicApiKey" TEXT,
ADD COLUMN     "emailNome" TEXT,
ADD COLUMN     "emailRemetente" TEXT,
ADD COLUMN     "emailSenha" TEXT,
ADD COLUMN     "evolutionApiKey" TEXT,
ADD COLUMN     "evolutionApiUrl" TEXT,
ADD COLUMN     "evolutionInstance" TEXT,
ADD COLUMN     "googleApiKey" TEXT,
ADD COLUMN     "openaiApiKey" TEXT,
ADD COLUMN     "openaiBaseUrl" TEXT,
ADD COLUMN     "openaiModel" TEXT,
ADD COLUMN     "systemPromptCrm" TEXT,
ADD COLUMN     "systemPromptOnboarding" TEXT,
ADD COLUMN     "systemPromptPortal" TEXT,
ADD COLUMN     "systemPromptWhatsapp" TEXT,
ADD COLUMN     "voyageApiKey" TEXT,
ADD COLUMN     "whatsappAiEnabled" BOOLEAN DEFAULT false,
ADD COLUMN     "whatsappAiFeature" TEXT DEFAULT 'onboarding';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "funil" TEXT NOT NULL DEFAULT 'onboarding';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "precisaTrocarSenha" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "conversas_ia" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "clienteId" TEXT,
    "leadId" TEXT,
    "remoteJid" TEXT,
    "sessionId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversas_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_ia" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalacoes" (
    "id" TEXT NOT NULL,
    "canal" "CanalEscalacao" NOT NULL,
    "status" "StatusEscalacao" NOT NULL DEFAULT 'pendente',
    "clienteId" TEXT,
    "leadId" TEXT,
    "remoteJid" TEXT,
    "sessionId" TEXT,
    "historico" JSONB NOT NULL,
    "ultimaMensagem" TEXT NOT NULL,
    "motivoIA" TEXT,
    "operadorId" TEXT,
    "orientacaoHumana" TEXT,
    "respostaEnviada" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversas_ia_remoteJid_canal_idx" ON "conversas_ia"("remoteJid", "canal");

-- CreateIndex
CREATE INDEX "conversas_ia_sessionId_canal_idx" ON "conversas_ia"("sessionId", "canal");

-- CreateIndex
CREATE INDEX "conversas_ia_leadId_canal_idx" ON "conversas_ia"("leadId", "canal");

-- CreateIndex
CREATE INDEX "conversas_ia_clienteId_canal_idx" ON "conversas_ia"("clienteId", "canal");

-- CreateIndex
CREATE INDEX "conversas_ia_atualizadaEm_idx" ON "conversas_ia"("atualizadaEm");

-- CreateIndex
CREATE INDEX "mensagens_ia_conversaId_criadaEm_idx" ON "mensagens_ia"("conversaId", "criadaEm");

-- AddForeignKey
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_ia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

