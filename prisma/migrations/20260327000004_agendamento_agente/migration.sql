-- Tabela de agendamentos do agente operacional
-- Permite criar tarefas recorrentes em linguagem natural com expressão cron

CREATE TABLE IF NOT EXISTS "agendamentos_agente" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "descricao"      TEXT         NOT NULL,
  "cron"           TEXT         NOT NULL,
  "instrucao"      TEXT         NOT NULL,
  "ativo"          BOOLEAN      NOT NULL DEFAULT true,
  "criadoPorId"    TEXT,
  "criadoPorNome"  TEXT,
  "ultimoDisparo"  TIMESTAMP(3),
  "proximoDisparo" TIMESTAMP(3),
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agendamentos_agente_ativo_proximoDisparo_idx"
  ON "agendamentos_agente" ("ativo", "proximoDisparo");
