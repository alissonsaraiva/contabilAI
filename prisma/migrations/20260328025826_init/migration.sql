-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('admin', 'contador', 'assistente');

-- CreateEnum
CREATE TYPE "PlanoTipo" AS ENUM ('essencial', 'profissional', 'empresarial', 'startup');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('pix', 'boleto', 'cartao');

-- CreateEnum
CREATE TYPE "StatusLead" AS ENUM ('iniciado', 'simulador', 'plano_escolhido', 'dados_preenchidos', 'revisao', 'contrato_gerado', 'aguardando_assinatura', 'assinado', 'expirado', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('ativo', 'inadimplente', 'suspenso', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('rascunho', 'enviado', 'aguardando_assinatura', 'parcialmente_assinado', 'assinado', 'cancelado', 'expirado');

-- CreateEnum
CREATE TYPE "Regime" AS ENUM ('MEI', 'SimplesNacional', 'LucroPresumido', 'LucroReal', 'Autonomo');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('baixa', 'media', 'alta', 'urgente');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('pendente', 'em_andamento', 'aguardando_cliente', 'concluida', 'cancelada');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('site', 'whatsapp', 'indicacao', 'instagram', 'google', 'outro');

-- CreateEnum
CREATE TYPE "StatusEscalacao" AS ENUM ('pendente', 'em_atendimento', 'resolvida');

-- CreateEnum
CREATE TYPE "CanalEscalacao" AS ENUM ('whatsapp', 'onboarding', 'portal');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "tipo" "TipoUsuario" NOT NULL DEFAULT 'assistente',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "precisaTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
    "tipo" "PlanoTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "valorMinimo" DECIMAL(10,2) NOT NULL,
    "valorMaximo" DECIMAL(10,2) NOT NULL,
    "servicos" JSONB,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "contatoEntrada" TEXT NOT NULL,
    "canal" "Canal" NOT NULL DEFAULT 'site',
    "funil" TEXT NOT NULL DEFAULT 'onboarding',
    "status" "StatusLead" NOT NULL DEFAULT 'iniciado',
    "stepAtual" INTEGER NOT NULL DEFAULT 1,
    "planoTipo" "PlanoTipo",
    "valorNegociado" DECIMAL(10,2),
    "vencimentoDia" INTEGER,
    "formaPagamento" "FormaPagamento",
    "dadosJson" JSONB,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "responsavelId" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "expiradoEm" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "regime" "Regime",
    "status" "StatusCliente" NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "empresaId" TEXT,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "estadoCivil" TEXT,
    "profissao" TEXT,
    "nacionalidade" TEXT DEFAULT 'Brasileiro(a)',
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "planoTipo" "PlanoTipo" NOT NULL,
    "valorMensal" DECIMAL(10,2) NOT NULL,
    "vencimentoDia" INTEGER NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "status" "StatusCliente" NOT NULL DEFAULT 'ativo',
    "motivoInativacao" TEXT,
    "inativadoEm" TIMESTAMP(3),
    "inativadoPorId" TEXT,
    "reativadoEm" TIMESTAMP(3),
    "responsavelId" TEXT,
    "observacoesInternas" TEXT,
    "tags" JSONB,
    "dataInicio" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "qualificacao" TEXT,
    "participacao" DECIMAL(5,2),
    "email" TEXT,
    "telefone" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "portalAccess" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "socios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "leadId" TEXT,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "clienteId" TEXT,
    "clicksignKey" TEXT,
    "clicksignUrl" TEXT,
    "clicksignSignUrl" TEXT,
    "zapsignDocToken" TEXT,
    "zapsignSignUrl" TEXT,
    "status" "StatusContrato" NOT NULL DEFAULT 'rascunho',
    "planoTipo" "PlanoTipo" NOT NULL,
    "valorMensal" DECIMAL(10,2) NOT NULL,
    "vencimentoDia" INTEGER NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "pdfUrl" TEXT,
    "dadosSnapshot" JSONB,
    "geradoEm" TIMESTAMP(3),
    "enviadoEm" TIMESTAMP(3),
    "assinadoEm" TIMESTAMP(3),
    "expiradoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "clienteId" TEXT,
    "responsavelId" TEXT,
    "status" "StatusTarefa" NOT NULL DEFAULT 'pendente',
    "prioridade" "Prioridade" NOT NULL DEFAULT 'media',
    "prazo" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "leadId" TEXT,
    "usuarioId" TEXT,
    "tipo" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'sistema',
    "escritorioEvento" BOOLEAN NOT NULL DEFAULT false,
    "titulo" TEXT,
    "conteudo" TEXT,
    "metadados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT,
    "url" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "metadados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escritorio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'ContabAI',
    "nomeFantasia" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "corPrimaria" TEXT DEFAULT '#6366f1',
    "corSecundaria" TEXT DEFAULT '#8b5cf6',
    "fraseBemVindo" TEXT,
    "metaDescricao" TEXT,
    "cnpj" TEXT,
    "crc" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "provedorAssinatura" TEXT DEFAULT 'zapsign',
    "zapsignToken" TEXT,
    "clicksignKey" TEXT,
    "clicksignHmacSecret" TEXT,
    "zapiInstanceId" TEXT,
    "zapiToken" TEXT,
    "serproCpfToken" TEXT,
    "serproCnpjToken" TEXT,
    "contratoTemplate" TEXT,
    "multaPercent" DOUBLE PRECISION DEFAULT 2.0,
    "jurosMesPercent" DOUBLE PRECISION DEFAULT 1.0,
    "diasAtrasoMulta" INTEGER DEFAULT 15,
    "diasInadimplenciaRescisao" INTEGER DEFAULT 60,
    "diasAvisoRescisao" INTEGER DEFAULT 30,
    "diasDocumentosAntecedencia" INTEGER DEFAULT 5,
    "vencimentosDias" JSONB,
    "pixDescontoPercent" DOUBLE PRECISION DEFAULT 5.0,
    "aiProvider" TEXT DEFAULT 'claude',
    "anthropicApiKey" TEXT,
    "voyageApiKey" TEXT,
    "openaiApiKey" TEXT,
    "openaiBaseUrl" TEXT,
    "openaiModel" TEXT,
    "googleApiKey" TEXT,
    "groqApiKey" TEXT,
    "aiModelOnboarding" TEXT DEFAULT 'claude-haiku-4-5-20251001',
    "aiModelCrm" TEXT DEFAULT 'claude-haiku-4-5-20251001',
    "aiModelPortal" TEXT DEFAULT 'claude-haiku-4-5-20251001',
    "aiModelWhatsapp" TEXT DEFAULT 'claude-haiku-4-5-20251001',
    "aiModelAgente" TEXT DEFAULT 'claude-haiku-4-5-20251001',
    "aiProviderOnboarding" TEXT DEFAULT 'claude',
    "aiProviderCrm" TEXT DEFAULT 'claude',
    "aiProviderPortal" TEXT DEFAULT 'claude',
    "aiProviderWhatsapp" TEXT DEFAULT 'claude',
    "aiProviderAgente" TEXT DEFAULT 'claude',
    "nomeAssistenteOnboarding" TEXT,
    "nomeAssistenteCrm" TEXT,
    "nomeAssistentePortal" TEXT,
    "nomeAssistenteWhatsapp" TEXT,
    "systemPromptOnboarding" TEXT,
    "systemPromptCrm" TEXT,
    "systemPromptPortal" TEXT,
    "toolsDesabilitadas" JSONB,
    "toolsCanaisOverride" JSONB,
    "emailRemetente" TEXT,
    "emailNome" TEXT,
    "emailSenha" TEXT,
    "emailSmtpHost" TEXT,
    "emailSmtpPort" INTEGER,
    "emailImapHost" TEXT,
    "emailImapPort" INTEGER,
    "whatsappAiEnabled" BOOLEAN DEFAULT false,
    "whatsappAiFeature" TEXT DEFAULT 'onboarding',
    "systemPromptWhatsapp" TEXT,
    "evolutionApiUrl" TEXT,
    "evolutionApiKey" TEXT,
    "evolutionInstance" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escritorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas_ia" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "clienteId" TEXT,
    "leadId" TEXT,
    "remoteJid" TEXT,
    "sessionId" TEXT,
    "pausadaEm" TIMESTAMP(3),
    "pausadoPorId" TEXT,
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
    "status" "StatusMensagem" NOT NULL DEFAULT 'pending',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erroEnvio" TEXT,
    "whatsappMsgData" JSONB,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaFileName" TEXT,
    "mediaMimeType" TEXT,
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
    "conversaIAId" TEXT,
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

-- CreateTable
CREATE TABLE "portal_tokens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "socioId" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_status_historico" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "statusAntes" "StatusCliente" NOT NULL,
    "statusDepois" "StatusCliente" NOT NULL,
    "motivo" TEXT,
    "operadorId" TEXT,
    "operadorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_status_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_acoes" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "leadId" TEXT,
    "solicitanteAI" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "usuarioTipo" TEXT,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "duracaoMs" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos_agente" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "instrucao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "ultimoDisparo" TIMESTAMP(3),
    "proximoDisparo" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_agente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "planos_tipo_key" ON "planos"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_leadId_key" ON "clientes"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresaId_key" ON "clientes"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cpf_key" ON "clientes"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_email_key" ON "clientes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_leadId_key" ON "contratos"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_clicksignKey_key" ON "contratos"("clicksignKey");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_zapsignDocToken_key" ON "contratos"("zapsignDocToken");

-- CreateIndex
CREATE INDEX "interacoes_clienteId_criadoEm_idx" ON "interacoes"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "interacoes_leadId_criadoEm_idx" ON "interacoes"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "interacoes_origem_criadoEm_idx" ON "interacoes"("origem", "criadoEm");

-- CreateIndex
CREATE INDEX "interacoes_escritorioEvento_criadoEm_idx" ON "interacoes"("escritorioEvento", "criadoEm");

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

-- CreateIndex
CREATE UNIQUE INDEX "portal_tokens_token_key" ON "portal_tokens"("token");

-- CreateIndex
CREATE INDEX "portal_tokens_empresaId_idx" ON "portal_tokens"("empresaId");

-- CreateIndex
CREATE INDEX "portal_tokens_clienteId_idx" ON "portal_tokens"("clienteId");

-- CreateIndex
CREATE INDEX "portal_tokens_socioId_idx" ON "portal_tokens"("socioId");

-- CreateIndex
CREATE INDEX "cliente_status_historico_clienteId_criadoEm_idx" ON "cliente_status_historico"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "agente_acoes_clienteId_criadoEm_idx" ON "agente_acoes"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "agente_acoes_leadId_criadoEm_idx" ON "agente_acoes"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "agente_acoes_tool_criadoEm_idx" ON "agente_acoes"("tool", "criadoEm");

-- CreateIndex
CREATE INDEX "agente_acoes_usuarioId_criadoEm_idx" ON "agente_acoes"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "agendamentos_agente_ativo_proximoDisparo_idx" ON "agendamentos_agente"("ativo", "proximoDisparo");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socios" ADD CONSTRAINT "socios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_ia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_status_historico" ADD CONSTRAINT "cliente_status_historico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
