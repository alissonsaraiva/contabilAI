-- ContabilAI — Inicialização do schema de vetores (pgvector)
-- Idempotente: pode ser executado múltiplas vezes sem erro
-- Executar no banco: contabil_ia
--
-- Na VPS:
--   docker exec -i postgresql-4cnu-postgresql-1 psql -U <user> contabil_ia < scripts/init-vectors.sql

-- Habilita a extensão pgvector (requer PostgreSQL 12+ com pgvector instalado)
CREATE EXTENSION IF NOT EXISTS vector;

-- Schema dedicado para vetores (separado do schema public/relacional)
CREATE SCHEMA IF NOT EXISTS vectors;

-- Tabela principal de embeddings
CREATE TABLE IF NOT EXISTS vectors.embeddings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Escopo de visibilidade
  escopo        TEXT        NOT NULL CHECK (escopo IN ('global', 'cliente', 'lead')),

  -- Tipo de conhecimento (ver src/lib/rag/types.ts)
  tipo          TEXT        NOT NULL,

  -- Referências opcionais às entidades relacionais (sem FK — banco separado do relacional)
  cliente_id    TEXT,
  lead_id       TEXT,
  documento_id  TEXT,

  -- Conteúdo
  titulo        TEXT,
  conteudo      TEXT        NOT NULL,

  -- Vetor (voyage-3-lite = 512 dimensões)
  embedding     vector(512),

  -- Metadados livres (chunk_index, total_chunks, source_url, etc.)
  metadata      JSONB,

  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice HNSW para busca por similaridade (cosine) — muito mais rápido que IVFFlat
-- ef_construction=128 e m=16 são bons defaults para até ~1M vetores
CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx
  ON vectors.embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- Índices relacionais para filtragem eficiente
CREATE INDEX IF NOT EXISTS embeddings_escopo_idx    ON vectors.embeddings (escopo);
CREATE INDEX IF NOT EXISTS embeddings_tipo_idx      ON vectors.embeddings (tipo);
CREATE INDEX IF NOT EXISTS embeddings_cliente_idx   ON vectors.embeddings (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS embeddings_lead_idx      ON vectors.embeddings (lead_id)    WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS embeddings_criado_em_idx ON vectors.embeddings (criado_em DESC);
