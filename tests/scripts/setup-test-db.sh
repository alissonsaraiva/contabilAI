#!/usr/bin/env bash
# Inicializa o banco de testes para rodar testes de integração.
# Uso: bash tests/scripts/setup-test-db.sh
#
# Pré-requisito: docker compose -f docker-compose.test.yml up -d

set -euo pipefail

DB_URL="postgresql://test:test@localhost:5433/contabai_test"

echo "⏳ Aguardando PostgreSQL..."
for i in $(seq 1 30); do
  if pg_isready -h localhost -p 5433 -U test -q 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "⏳ Aplicando migrations Prisma..."
DATABASE_URL="$DB_URL" npx prisma migrate deploy 2>&1

echo "⏳ Inicializando schema pgvector..."
docker exec contabai_test_db psql -U test contabai_test << 'EOSQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS vectors;
CREATE TABLE IF NOT EXISTS vectors.embeddings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo        TEXT        NOT NULL CHECK (escopo IN ('global', 'cliente', 'lead')),
  canal         TEXT        DEFAULT 'geral',
  tipo          TEXT        NOT NULL,
  cliente_id    TEXT,
  lead_id       TEXT,
  documento_id  TEXT,
  titulo        TEXT,
  conteudo      TEXT        NOT NULL,
  embedding     vector(512),
  metadata      JSONB,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx ON vectors.embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128);
CREATE INDEX IF NOT EXISTS embeddings_escopo_idx ON vectors.embeddings (escopo);
CREATE INDEX IF NOT EXISTS embeddings_tipo_idx ON vectors.embeddings (tipo);
CREATE INDEX IF NOT EXISTS embeddings_cliente_idx ON vectors.embeddings (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS embeddings_lead_idx ON vectors.embeddings (lead_id) WHERE lead_id IS NOT NULL;
EOSQL

echo "✅ Banco de testes pronto"
