-- Migration: feat_notas_fiscais_spedy
-- Adiciona: enum StatusNotaFiscal, model NotaFiscal, campos Spedy em Empresa e Escritorio

-- ─── Enum StatusNotaFiscal ────────────────────────────────────────────────────
CREATE TYPE "StatusNotaFiscal" AS ENUM (
  'rascunho',
  'enviando',
  'processando',
  'autorizada',
  'rejeitada',
  'cancelada',
  'erro_interno'
);

-- ─── Campos Spedy em Empresa ──────────────────────────────────────────────────
ALTER TABLE "empresas"
  ADD COLUMN "spedyCompanyId"          TEXT,
  ADD COLUMN "spedyApiKey"             TEXT,
  ADD COLUMN "spedyConfigurado"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "spedyConfiguradoEm"      TIMESTAMP(3),
  ADD COLUMN "spedyFederalServiceCode" TEXT,
  ADD COLUMN "spedyCityServiceCode"    TEXT,
  ADD COLUMN "spedyIssAliquota"        DECIMAL(5,4),
  ADD COLUMN "spedyIssWithheld"        BOOLEAN,
  ADD COLUMN "spedyTaxationType"       TEXT,
  ADD COLUMN "spedyConfigFiscal"       JSONB;

CREATE UNIQUE INDEX "empresas_spedyCompanyId_key" ON "empresas"("spedyCompanyId");

-- ─── Campos Spedy em Escritorio ───────────────────────────────────────────────
ALTER TABLE "escritorio"
  ADD COLUMN "spedyApiKey"             TEXT,
  ADD COLUMN "spedyAmbiente"           TEXT DEFAULT 'sandbox',
  ADD COLUMN "spedyWebhookId"          TEXT,
  ADD COLUMN "spedyFederalServiceCode" TEXT,
  ADD COLUMN "spedyCityServiceCode"    TEXT,
  ADD COLUMN "spedyIssAliquota"        DECIMAL(5,4),
  ADD COLUMN "spedyTaxationType"       TEXT DEFAULT 'taxationInMunicipality',
  ADD COLUMN "spedyIssWithheld"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "spedyAutoEmitirOS"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "spedyEnviarAoAutorizar"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "spedyEnviarCanalPadrao"  TEXT DEFAULT 'whatsapp',
  ADD COLUMN "spedyDescricaoTemplate"  TEXT;

-- ─── Model NotaFiscal ─────────────────────────────────────────────────────────
CREATE TABLE "notas_fiscais" (
  "id"                       TEXT NOT NULL,
  "clienteId"                TEXT NOT NULL,
  "empresaId"                TEXT,
  "ordemServicoId"           TEXT,
  "emitidaPorId"             TEXT,
  "spedyId"                  TEXT,
  "integrationId"            TEXT,
  "status"                   "StatusNotaFiscal" NOT NULL DEFAULT 'rascunho',
  "numero"                   INTEGER,
  "rpsNumero"                INTEGER,
  "rpsSerie"                 TEXT,
  "descricao"                TEXT NOT NULL,
  "valorTotal"               DECIMAL(10,2) NOT NULL,
  "issRetido"                BOOLEAN NOT NULL DEFAULT false,
  "issAliquota"              DECIMAL(5,4),
  "issValor"                 DECIMAL(10,2),
  "pisAliquota"              DECIMAL(5,4),
  "pisValor"                 DECIMAL(10,2),
  "cofinsAliquota"           DECIMAL(5,4),
  "cofinsValor"              DECIMAL(10,2),
  "irAliquota"               DECIMAL(5,4),
  "irValor"                  DECIMAL(10,2),
  "valorLiquido"             DECIMAL(10,2),
  "federalServiceCode"       TEXT,
  "cityServiceCode"          TEXT,
  "taxationType"             TEXT,
  "tomadorNome"              TEXT,
  "tomadorCpfCnpj"           TEXT,
  "tomadorEmail"             TEXT,
  "tomadorMunicipio"         TEXT,
  "tomadorEstado"            TEXT,
  "xmlUrl"                   TEXT,
  "pdfUrl"                   TEXT,
  "chaveAcesso"              TEXT,
  "protocolo"                TEXT,
  "autorizadaEm"             TIMESTAMP(3),
  "canceladaEm"              TIMESTAMP(3),
  "cancelamentoJustificativa" TEXT,
  "erroCodigo"               TEXT,
  "erroMensagem"             TEXT,
  "tentativas"               INTEGER NOT NULL DEFAULT 0,
  "enviadaClienteEm"         TIMESTAMP(3),
  "enviadaClienteCanal"      TEXT,
  "criadoEm"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "notas_fiscais_spedyId_key"       ON "notas_fiscais"("spedyId");
CREATE UNIQUE INDEX "notas_fiscais_integrationId_key" ON "notas_fiscais"("integrationId");

-- Indexes
CREATE INDEX "notas_fiscais_clienteId_criadoEm"   ON "notas_fiscais"("clienteId", "criadoEm");
CREATE INDEX "notas_fiscais_empresaId_criadoEm"   ON "notas_fiscais"("empresaId", "criadoEm");
CREATE INDEX "notas_fiscais_status_criadoEm"      ON "notas_fiscais"("status", "criadoEm");
CREATE INDEX "notas_fiscais_ordemServicoId"        ON "notas_fiscais"("ordemServicoId");
CREATE INDEX "notas_fiscais_spedyId"               ON "notas_fiscais"("spedyId");
CREATE INDEX "notas_fiscais_clienteId_status"      ON "notas_fiscais"("clienteId", "status");

-- Foreign keys
ALTER TABLE "notas_fiscais"
  ADD CONSTRAINT "notas_fiscais_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notas_fiscais"
  ADD CONSTRAINT "notas_fiscais_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notas_fiscais"
  ADD CONSTRAINT "notas_fiscais_ordemServicoId_fkey"
    FOREIGN KEY ("ordemServicoId") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
