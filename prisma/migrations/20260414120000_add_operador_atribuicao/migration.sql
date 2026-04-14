-- Migration: add_operador_atribuicao
-- Rastreia qual operador enviou cada mensagem humana (MensagemIA.operadorId)
-- e qual operador é responsável por cada conversa/thread (ConversaIA.atribuidaParaId, Interacao.atribuidaParaId)

-- MensagemIA: operador humano que enviou (null = IA)
ALTER TABLE "mensagens_ia"
  ADD COLUMN "operadorId" TEXT,
  ADD CONSTRAINT "mensagens_ia_operadorId_fkey"
    FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "mensagens_ia_operadorId_idx" ON "mensagens_ia"("operadorId");

-- ConversaIA: operador atribuído como responsável
ALTER TABLE "conversas_ia"
  ADD COLUMN "atribuidaParaId" TEXT,
  ADD COLUMN "atribuidaEm"     TIMESTAMP(3),
  ADD CONSTRAINT "conversas_ia_atribuidaParaId_fkey"
    FOREIGN KEY ("atribuidaParaId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "conversas_ia_atribuidaParaId_idx" ON "conversas_ia"("atribuidaParaId");

-- Interacao: operador atribuído para responder o email/thread
ALTER TABLE "interacoes"
  ADD COLUMN "atribuidaParaId" TEXT,
  ADD COLUMN "atribuidaEm"     TIMESTAMP(3),
  ADD CONSTRAINT "interacoes_atribuidaParaId_fkey"
    FOREIGN KEY ("atribuidaParaId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "interacoes_atribuidaParaId_idx" ON "interacoes"("atribuidaParaId");
