# INFRA — Provisionamento de uma VPS nova

Guia passo a passo para subir o AVOS / ContabAI numa VPS Linux do zero. Reflete a infra real auditada na produção atual (Hostinger, Ubuntu 24.04).

> **Antes de tudo:** este doc cobre o *runbook*. Segredos de produção NÃO ficam aqui — gere novos para cada ambiente.

---

## 1. Pré-requisitos externos (contas e serviços)

Provisionar antes de tocar na VPS:

| Serviço | O que precisa | Onde usar |
|---|---|---|
| Domínio + DNS | Domínio raiz + subdomínios | `avos.digital`, `www`, `crm`, `portal` (ou equivalentes) |
| Hostinger / Cloud provider | VPS Ubuntu 24.04, 1 vCPU / 4 GB RAM / 50 GB disco mín. | Host |
| Cloudflare R2 (ou S3) | Bucket + access key/secret + endpoint público | Storage de arquivos |
| Resend | Domínio verificado + DKIM + API key | E-mails transacionais |
| Anthropic | API key (Claude) | IA — opcional se usar via banco |
| Voyage AI | API key | Embeddings RAG |
| OpenAI | API key | Fallback IA — opcional |
| Google Cloud Console | OAuth 2.0 Client ID/Secret + redirect URI `https://crm.<dominio>/api/auth/callback/google` | Login Google |
| Sentry | Projeto Next.js + DSN | Observabilidade |
| GitHub Container Registry | Token com `write:packages` | CI publica imagens |
| healthchecks.io | 1 check por cron (5 checks) | Alarme de cron parado |
| Evolution API | Sobe junto na VPS — gerar `AUTHENTICATION_API_KEY` aleatória | WhatsApp |
| Spedy (NFS-e) | API key + token | Emissão de NFS-e — opcional |
| DocuSeal | Token + template ID | Assinaturas — opcional |

DNS — apontar para o IP da VPS:

```
A    avos.digital          → <IP>
A    www.avos.digital      → <IP>
A    crm.avos.digital      → <IP>
A    portal.avos.digital   → <IP>
A    evolution-api-xxx.<host>.cloud → <IP>   (subdomínio da Evolution)
```

---

## 2. Bootstrap do host

SSH como root na primeira vez, depois desabilitar root login.

```bash
# Pacotes base
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban unattended-upgrades

# Usuário deploy
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# Docker (script oficial)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Swap (se RAM ≤ 4 GB)
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Timezone
timedatectl set-timezone America/Sao_Paulo
```

Sair como root, logar como `deploy` daqui em diante.

---

## 3. Estrutura de pastas

O padrão da produção atual:

```
/docker/traefik-zq71/         → stack do Traefik
/docker/postgresql-4cnu/      → stack do Postgres principal
/docker/evolution-api-swhw/   → stack da Evolution API
/home/deploy/contabai/        → repo do app + docker-compose.yml + .env
/home/deploy/contabai/backups/→ dumps SQL pré-deploy
/home/deploy/deploy.sh        → script de deploy manual
```

Os nomes `*-zq71`, `*-4cnu`, `*-swhw` são sufixos da Hostinger Coolify — em VPS limpa, use nomes simples (`traefik`, `postgres`, `evolution`). **Atenção:** o nome do projeto Compose vira prefixo de containers/redes/volumes e várias queries do app dependem disso. Se trocar, ajustar:
- Hostname do Postgres em `DATABASE_URL` (o app conecta por nome do container)
- Referência da rede externa em `docker-compose.yml` do app (`contabil_net`)
- Padrão de comandos `docker exec` em `memory/project_vps_access.md`

---

## 4. Rede Docker compartilhada

```bash
docker network create contabil_net
```

App e Postgres precisam estar nessa rede para se enxergarem por nome.

---

## 5. Stack: Traefik (reverse proxy + Let's Encrypt)

`/docker/traefik/docker-compose.yml`:

```yaml
services:
  traefik:
    image: traefik:latest
    restart: unless-stopped
    network_mode: host
    command:
      - --api.dashboard=false
      - --api.insecure=false
      - --log.level=INFO
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
    volumes:
      - traefik-letsencrypt:/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro

volumes:
  traefik-letsencrypt:
```

`.env` ao lado: `ACME_EMAIL=seu-email@dominio.com`

Subir: `cd /docker/traefik && docker compose up -d`

---

## 6. Stack: PostgreSQL principal

> **IMPORTANTE — pgvector é obrigatório.** O workflow de deploy executa `CREATE EXTENSION IF NOT EXISTS vector` e cria o schema `vectors` automaticamente. A imagem oficial `postgres:17` **não** tem pgvector — usar `pgvector/pgvector:pg17`.

`/docker/postgres/docker-compose.yml`:

```yaml
services:
  postgresql:
    image: pgvector/pgvector:pg17
    restart: unless-stopped
    ports:
      - "5432"   # só expõe na rede docker; UFW bloqueia externamente
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - default
      - contabil_net

networks:
  contabil_net:
    external: true

volumes:
  postgres_data:
```

`.env` ao lado (gerar valores aleatórios fortes):

```env
POSTGRES_USER=<16-32 chars aleatórios>
POSTGRES_PASSWORD=<32+ chars aleatórios>
POSTGRES_DB=contabil_ia
```

Geração de senha: `openssl rand -base64 32 | tr -d '/+=' | cut -c1-32`

Subir: `docker compose up -d`

> A extensão `vector` e o schema `vectors` (tabela `embeddings` + índices HNSW) são criados automaticamente pelo workflow de deploy a cada release. Não precisa fazer manual.

---

## 7. Stack: Evolution API (WhatsApp)

`/docker/evolution/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    command: [postgres, -c, max_connections=1000]
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:latest
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

  api:
    image: evoapicloud/evolution-api:latest
    ports:
      - "${PORT}:8080"
    labels:
      - traefik.enable=true
      - traefik.http.routers.evolution.rule=Host(`${EVOLUTION_HOST}`)
      - traefik.http.routers.evolution.entrypoints=websecure
      - traefik.http.routers.evolution.tls.certresolver=letsencrypt
      - traefik.http.services.evolution.loadbalancer.server.port=8080
    environment:
      SERVER_URL: https://${EVOLUTION_HOST}
      AUTHENTICATION_API_KEY: ${API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: true
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:${POSTGRES_PASSWORD}@postgres:5432/evolution
      DATABASE_CONNECTION_CLIENT_NAME: evolution_${COMPOSE_PROJECT_NAME}
      DATABASE_SAVE_DATA_INSTANCE: true
      DATABASE_SAVE_DATA_NEW_MESSAGE: true
      DATABASE_SAVE_MESSAGE_UPDATE: true
      DATABASE_SAVE_DATA_CONTACTS: true
      DATABASE_SAVE_DATA_CHATS: true
      DATABASE_SAVE_DATA_LABELS: true
      DATABASE_SAVE_DATA_HISTORIC: true
      DEL_INSTANCE: false
      CACHE_REDIS_ENABLED: true
      CACHE_REDIS_URI: redis://redis:6379/0
      CACHE_REDIS_PREFIX_KEY: evolution
      CACHE_LOCAL_ENABLED: false
      CONFIG_SESSION_PHONE_CLIENT: 'Evolution API V2'
      CONFIG_SESSION_PHONE_NAME: 'Chrome'
      QRCODE_LIMIT: '30'
      WEBSOCKET_ENABLED: false
      TELEMETRY_ENABLED: false
      LANGUAGE: 'en'
      CORS_ORIGIN: '*'
      LOG_LEVEL: ERROR,WARN,INFO
    volumes:
      - evolution_instances:/evolution/instances
    depends_on: [postgres, redis]
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  evolution_instances:
```

`.env`:
```env
COMPOSE_PROJECT_NAME=evolution
PORT=42572
EVOLUTION_HOST=evolution-api.<seu-dominio>
POSTGRES_PASSWORD=<aleatório>
API_KEY=<aleatório — guarda para configurar no CRM>
```

Subir e criar a instância `avos` via API (após o app estar de pé, fazer pelo CRM → Configurações → WhatsApp; gera QR code).

---

## 8. Geração de segredos do app

Rodar localmente ou na VPS:

```bash
# AUTH_SECRET (NextAuth)
openssl rand -base64 32

# ENCRYPTION_KEY (32 bytes hex p/ AES-256)
openssl rand -hex 32

# CRON_SECRET
openssl rand -hex 32

# VAPID (push notifications) — precisa de Node + web-push
npx web-push generate-vapid-keys
```

---

## 9. Stack: App ContabAI

```bash
sudo mkdir -p /home/deploy/contabai && sudo chown deploy:deploy /home/deploy/contabai
cd /home/deploy && git clone https://github.com/<org>/contabilAI.git contabai
cd contabai
```

O `docker-compose.yml` do app já está versionado no repo. Criar `.env` ao lado (NÃO commitar). Modelo:

```env
# Banco
DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@<container_name_postgres>:5432/contabil_ia
VECTORS_DATABASE_URL=${DATABASE_URL}
# Usadas pelo deploy.yml no pg_dump (fallback: extrai da DATABASE_URL)
DB_USER=<POSTGRES_USER>
DB_NAME=contabil_ia

# Auth
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://crm.<dominio>
NEXTAUTH_URL=https://crm.<dominio>

# Cripto
ENCRYPTION_KEY=<openssl rand -hex 32>

# IA
AI_PROVIDER=claude
ANTHROPIC_API_KEY=    # opcional — chaves de IA podem ficar no banco via getAiConfig()
OPENAI_API_KEY=
VOYAGE_API_KEY=<key>

# E-mail
RESEND_API_KEY=<key>
RESEND_FROM=contato@<dominio>

# OAuth Google
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>

# Storage (R2 / S3)
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://<account>.r2.cloudflarestorage.com/<bucket>
STORAGE_BUCKET_NAME=<bucket>
STORAGE_ACCESS_KEY_ID=<key>
STORAGE_SECRET_ACCESS_KEY=<secret>
STORAGE_REGION=auto

# URLs públicas
NEXT_PUBLIC_APP_URL=https://crm.<dominio>
NEXT_PUBLIC_APP_NAME=Avos
NEXT_PUBLIC_CRM_URL=https://crm.<dominio>
NEXT_PUBLIC_PORTAL_URL=https://portal.<dominio>

# Cron
CRON_SECRET=<openssl rand -hex 32>

# Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid public>
VAPID_PRIVATE_KEY=<vapid private>
VAPID_SUBJECT=mailto:admin@<dominio>

# Sentry
NEXT_PUBLIC_SENTRY_DSN=<dsn>

# Healthchecks.io (URLs ping de cada cron)
HC_PROCESSAR_PENDENTES=https://hc-ping.com/<uuid>
HC_AGENTE=https://hc-ping.com/<uuid>
HC_RETRY_DOCUMENTOS=https://hc-ping.com/<uuid>
HC_RECONCILIAR_NOTAS=https://hc-ping.com/<uuid>
HC_EMAIL_SYNC=https://hc-ping.com/<uuid>

# Integrações opcionais
DOCUSEAL_API_URL=
DOCUSEAL_API_KEY=
DOCUSEAL_TEMPLATE_ID=
CLICKSIGN_API_KEY=
ZAPSIGN_API_TOKEN=
```

### Primeiro build & subida

O deploy oficial é via CI (GitHub Actions com tag `v*`). Para subir manual a primeira vez:

```bash
cd /home/deploy/contabai
docker build --target migrator -t contabai:migrator .
docker build --target runner -t contabai:latest .

# Aplica migrations
docker run --rm --network=contabil_net \
  -e DATABASE_URL="$(grep ^DATABASE_URL= .env | cut -d= -f2-)" \
  contabai:migrator

# Sobe
docker compose up -d
```

---

## 10. Bootstrap inicial do banco

Após `prisma migrate deploy` rodar (acontece automaticamente no primeiro deploy via CI ou manualmente via `contabai:migrator`), o schema existe mas o banco está vazio. Duas opções:

### Opção A — Seed completo (desenvolvimento / staging)

Cria admin + contador + planos + leads/clientes mock. Útil pra testar tudo. **Não usar em produção limpa** — vai inserir dados fictícios.

```bash
docker run --rm --network contabil_net \
  -e DATABASE_URL="$DATABASE_URL" \
  contabai:migrator npx prisma db seed
```

Credenciais criadas: `admin@contabai.com.br` / `admin123` (TROCAR após primeiro login).

### Opção B — Produção limpa (manual)

Conectar no Postgres e inserir só o mínimo:

```bash
docker exec -it <postgres_container> psql -U <user> -d contabil_ia
```

```sql
-- 1) Registro do escritório (todos os campos exceto id/nome têm defaults ou são nullable)
INSERT INTO escritorio (id, nome, "criadoEm", "atualizadoEm")
VALUES (gen_random_uuid(), 'Nome do Escritório', NOW(), NOW());

-- 2) Usuário admin — gerar bcrypt hash da senha primeiro:
--    docker run --rm node:20 node -e "require('bcryptjs').hash('SUASENHA',12).then(console.log)"
INSERT INTO usuarios (id, nome, email, "senhaHash", tipo, ativo, "criadoEm", "atualizadoEm")
VALUES (
  gen_random_uuid(),
  'Seu Nome',
  'voce@dominio.com',
  '$2a$12$...hash...',   -- output do bcrypt acima
  'admin',
  true,
  NOW(),
  NOW()
);
```

Os tipos válidos para `usuarios.tipo` são: `admin`, `contador`, `assistente` (enum `TipoUsuario` em `prisma/schema.prisma`).

### Pós-bootstrap (no CRM)

Logar em `https://crm.<dominio>` e preencher:

- **Configurações → Escritório:** nome fantasia, logo, cores, CNPJ, endereço (alimenta o branding dinâmico)
- **Configurações → WhatsApp:** URL da Evolution (`https://evolution-api.<dominio>`), API key (a `AUTHENTICATION_API_KEY` que você gerou na seção 7), nome da instância (`avos` ou outro) → clicar em "Conectar" e escanear QR
- **Configurações → IA:** chaves Anthropic / OpenAI / Voyage (ficam encriptadas via `ENCRYPTION_KEY`, NÃO precisa estar no `.env`)
- **Configurações → Spedy** (se for emitir NFS-e): token + API key
- **Configurações → Assinatura** (se usar): ZapSign ou Clicksign

---

## 11. Crontab

Editar com `crontab -e` no usuário `deploy`:

```cron
# WhatsApp — processar mensagens pendentes (12x/min ≈ 5s)
* * * * * for i in 1 2 3 4 5 6 7 8 9 10 11 12; do curl -s -X POST https://crm.<dominio>/api/whatsapp/processar-pendentes -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1; sleep 5; done

# Agente operacional (1x/min)
* * * * * curl -s -X POST https://crm.<dominio>/api/agente/cron -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# Retry de upload de documentos (1x/h)
0 * * * * curl -s -X POST https://crm.<dominio>/api/cron/retry-documentos -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# Reconciliação de NFS-e Spedy (1x/h)
0 * * * * curl -s -X POST https://crm.<dominio>/api/cron/reconciliar-notas -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# DAS MEI — geração 8h, lembrete 9h, pagamento 10h
0 8 * * * curl -s -X POST https://crm.<dominio>/api/cron/gerar-das-mei -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1
0 9 * * * curl -s -X POST https://crm.<dominio>/api/cron/lembrete-das-mei -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1
0 10 * * * curl -s -X POST https://crm.<dominio>/api/cron/verificar-pagamento-das-mei -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# Procuração Receita Federal (9h05)
5 9 * * * curl -s -X POST https://crm.<dominio>/api/cron/verificar-procuracao-rf -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# Lembrete de documentos (9h)
0 9 * * * curl -s -X POST https://crm.<dominio>/api/cron/lembrete-documentos -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# Broadcast WhatsApp (1x/min)
* * * * * curl -s -X POST https://crm.<dominio>/api/crm/listas-transmissao/processar-envios -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1

# E-mail sync — DESABILITADO atualmente (descomentar quando reabilitar módulo email)
# */2 * * * * curl -s -X POST https://crm.<dominio>/api/email/sync -H "Authorization: Bearer <CRON_SECRET>" > /dev/null 2>&1
```

Instrumentação healthchecks.io: o código em `src/lib/healthchecks.ts` faz ping nas URLs `HC_*` ao final de cada cron. Criar 1 check por endpoint no painel do healthchecks com o intervalo correto.

---

## 12. CI/CD (GitHub Actions)

Arquivos em `.github/workflows/`:
- `ci.yml` — testes unitários + lint + tsc (roda em PRs e antes do deploy)
- `deploy.yml` — dispara em tags `v*`, depende do `ci.yml` passar

Pipeline do `deploy.yml`:

1. Roda `ci.yml` como dependência (testes precisam passar)
2. Build multi-stage no runner do GitHub (não na VPS):
   - `ghcr.io/<owner>/<repo>:<tag>` — imagem do app (target `runner`)
   - `ghcr.io/<owner>/<repo>-migrate:<tag>` — imagem das migrations (target `migrator`)
   - Build args expostos: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
3. `scp` do `docker-compose.yml` versionado pra `/home/deploy/contabai/`
4. SSH na VPS executa:
   - Lê `DB_USER` e `DB_NAME` do `.env` (fallback: extrai da `DATABASE_URL`)
   - `pg_dump` → `backups/db-<tag>-<timestamp>.sql` (mantém os 10 mais recentes)
   - `docker login ghcr.io` + pull das duas imagens
   - Re-tag da imagem do app como `contabai:latest`
   - Roda migrations via container migrator
   - Cria/garante extensão `vector` + schema `vectors` + tabela `embeddings` + índices HNSW
   - `docker compose up -d --no-deps app`
   - Limpa imagens antigas do ghcr na VPS e dangling

### Secrets necessários no GitHub repo (Settings → Secrets → Actions)

| Secret | Valor |
|---|---|
| `VPS_HOST` | IP ou hostname da VPS |
| `VPS_USER` | `deploy` |
| `VPS_PORT` | `22` (ou porta SSH custom) |
| `VPS_SSH_KEY` | Chave privada SSH do user `deploy` (formato OpenSSH) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN do Sentry (também vai pro `.env` da VPS) |
| `SENTRY_AUTH_TOKEN` | Token p/ upload de source maps no build |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Chave VAPID pública |

> `GITHUB_TOKEN` é fornecido automaticamente pelo Actions — não precisa criar.

### Hardcode crítico no `deploy.yml`

O script usa o nome do container Postgres **hardcoded**: `postgresql-4cnu-postgresql-1`. Se você nomear o stack do Postgres diferente, **editar o `deploy.yml`** trocando essa string nas duas ocorrências (`pg_dump` e `psql`).

Mesma observação para a rede `contabil_net` — está no `docker run` da migration.

### Disparar deploy

```bash
git tag v3.x.y
git push origin v3.x.y
```

Push em `main` sozinho **não dispara nada**. Só tag `v*`.

---

## 13. Restore de backup

Listar backups disponíveis:

```bash
ls -lh /home/deploy/contabai/backups/
```

Restore:

```bash
# Parar o app pra evitar escritas durante o restore
docker stop contabai_app

# Drop + recria o banco
docker exec <postgres_container> psql -U <user> -d postgres -c \
  "DROP DATABASE contabil_ia; CREATE DATABASE contabil_ia;"

# Restaura
cat /home/deploy/contabai/backups/db-<tag>-<ts>.sql | \
  docker exec -i <postgres_container> psql -U <user> -d contabil_ia

# Sobe o app
docker start contabai_app
```

---

## 14. Validação pós-setup

Checklist mínimo antes de considerar a VPS pronta:

- [ ] `https://crm.<dominio>` carrega com cert Let's Encrypt válido
- [ ] Login Google funciona (callback URI configurada no Google Cloud)
- [ ] Upload de arquivo no portal sobe para o R2
- [ ] Resend envia e-mail de teste (Configurações → Testar e-mail)
- [ ] Evolution API responde: `curl -H "apikey: <API_KEY>" https://evolution-api.<dominio>/instance/fetchInstances`
- [ ] Instância `avos` conectada via QR code; envio de mensagem manual chega no número de teste
- [ ] `docker exec <postgres> psql -U <user> -d contabil_ia -c "SELECT extname FROM pg_extension"` lista `vector`
- [ ] Crons rodando — verificar `tail -f /var/log/syslog | grep CRON`
- [ ] Healthchecks pingados em `hc-ping.com`
- [ ] Sentry recebendo evento (forçar erro de teste)
- [ ] Push notification funciona no portal (VAPID configurado)
- [ ] UFW ativo: `sudo ufw status` — só 22, 80, 443 abertas

---

## 15. Manutenção contínua

- **Backups manuais sob demanda:** `docker exec <postgres> pg_dump -U <user> contabil_ia | gzip > backup-manual-$(date +%F).sql.gz`
- **Logs do app:** `docker logs contabai_app --since=1h 2>&1 | tail -100`
- **Atualizar Traefik/Postgres/Evolution:** `docker compose pull && docker compose up -d` na pasta respectiva
- **Cron extra/novo:** sempre criar healthcheck no hc-ping.com e var `HC_*` no `.env`

Estado atual da VPS de produção: ver `memory/project_vps_infra.md`.

---

## 16. Configuração de serviços externos

A VPS pode estar 100% de pé e o app ainda não funcionar se as integrações externas não estiverem configuradas do lado de lá. Lista do que precisa ser feito **fora** da VPS:

### 16.1 Cloudflare R2 (storage de arquivos)

1. Criar bucket (ex: `contabia`) em **Cloudflare → R2**.
2. **Tornar público:** R2 → bucket → Settings → Public access → habilitar custom domain ou usar o subdomínio `r2.dev` (não recomendado pra produção — usar `STORAGE_PUBLIC_URL` apontando pro custom domain).
3. **CORS** — sem isso, upload direto do browser falha. R2 → bucket → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://crm.<dominio>", "https://portal.<dominio>"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. **Criar API Token** com permissão `Object Read & Write` no bucket — pegar `Access Key ID` e `Secret Access Key` → `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`.
5. `STORAGE_ENDPOINT` é `https://<account_id>.r2.cloudflarestorage.com` (sem o nome do bucket no fim).
6. `STORAGE_PUBLIC_URL` é a URL pública (custom domain ou `https://<bucket>.<account>.r2.dev`).

### 16.2 Google OAuth (login no CRM e Portal)

No **Google Cloud Console → APIs & Services**:

1. **OAuth consent screen** → External → preencher:
   - Nome do app, e-mail de suporte, logo
   - Domínio autorizado: `<dominio>` (ex: `avos.digital`)
   - Scopes: `openid`, `email`, `profile` (não precisa de scopes restritos)
   - Política de privacidade + termos de uso (URLs públicas do app)
2. **Credentials → Create OAuth Client ID** → tipo **Web application**:
   - **Authorized JavaScript origins:**
     - `https://crm.<dominio>`
     - `https://portal.<dominio>`
   - **Authorized redirect URIs:**
     - `https://crm.<dominio>/api/auth/callback/google` (CRM — equipe interna)
     - `https://portal.<dominio>/api/portal/auth/callback/google` (Portal — clientes)
3. Copiar **Client ID** e **Client Secret** → `.env`: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Publicar o app (sair de "Testing") se for permitir qualquer usuário Google entrar. Senão fica restrito a 100 usuários teste.

### 16.3 Resend (e-mails transacionais)

1. **Resend → Domains → Add Domain:** `<dominio>`.
2. Adicionar os registros DNS no provedor de DNS:
   - 3x `MX` ou TXT SPF
   - DKIM (`resend._domainkey`)
   - `_dmarc` (recomendado)
3. Aguardar verificação (status "Verified").
4. **API Keys → Create:** com permissão **Sending access** → `RESEND_API_KEY`.
5. `RESEND_FROM` = endereço no domínio verificado, ex: `contato@<dominio>` ou `nao-responda@<dominio>`.

### 16.4 Sentry (observabilidade)

1. **Sentry → Create Project** → plataforma **Next.js**.
2. Pegar o **DSN** → `NEXT_PUBLIC_SENTRY_DSN` (vai pro `.env` da VPS **e** pro secret `NEXT_PUBLIC_SENTRY_DSN` do GitHub).
3. **Para upload de source maps no CI:** Sentry → Settings → Auth Tokens → criar token com escopo `project:releases` e `project:write` → secret `SENTRY_AUTH_TOKEN` no GitHub.
4. Confirmar `org` e `project` slug em `sentry.client.config.ts` / `next.config.ts` (devem bater com os do Sentry).

### 16.5 Evolution API — instância WhatsApp

Após o app subir, há duas formas de criar a instância:

**Via CRM** (preferido): Configurações → WhatsApp → preencher URL/API key/nome → "Conectar" gera QR.

**Via API direta** (se precisar antes do CRM estar pronto):

```bash
curl -X POST 'https://evolution-api.<dominio>/instance/create' \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "instanceName": "avos",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'

# Pegar QR code:
curl 'https://evolution-api.<dominio>/instance/connect/avos' \
  -H "apikey: $EVOLUTION_API_KEY"
```

**Webhook do Evolution → CRM** (configurar APÓS o app estar de pé):

```bash
curl -X POST 'https://evolution-api.<dominio>/webhook/set/avos' \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://crm.<dominio>/api/whatsapp/webhook",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE","CONNECTION_UPDATE"]
  }'
```

### 16.6 Webhooks externos — apontar para o CRM

Cada serviço integrado precisa ser configurado no painel **deles** com a URL pública do CRM:

| Serviço | URL no painel externo | Notas |
|---|---|---|
| Evolution API | `https://crm.<dominio>/api/whatsapp/webhook` | Via API (16.5) — não tem painel |
| Spedy (NFS-e) | `https://crm.<dominio>/api/webhooks/spedy` | Painel Spedy → Webhooks |
| Asaas (cobranças) | `https://crm.<dominio>/api/webhooks/asaas` | Painel Asaas → Integrações → Webhooks → eventos: `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED` |
| ZapSign | `https://crm.<dominio>/api/webhooks/zapsign?secret=<zapsignWebhookSecret>` | Painel ZapSign → Conta → Webhooks. O secret vai como query param e é validado pelo app |
| Clicksign | `https://crm.<dominio>/api/webhooks/clicksign` | Painel Clicksign → API → Webhooks. HMAC secret também precisa estar em Configurações → Assinatura no CRM |
| DocuSeal | `https://crm.<dominio>/api/webhooks/docuseal` | Painel DocuSeal → Webhooks |

> Configurar webhook **antes** de testar a integração — se chegar evento sem webhook configurado, o serviço externo pode mandar e-mail de erro / desabilitar o envio.

### 16.7 healthchecks.io

1. **healthchecks.io → Create Check** para cada cron (5 total: `processar-pendentes`, `agente`, `retry-documentos`, `reconciliar-notas`, `email-sync`).
2. Configurar **Period** + **Grace** condizente com o cron (ex: agente roda a cada 1 min → period 1 min, grace 5 min).
3. Copiar a URL de ping (formato `https://hc-ping.com/<uuid>`) → `.env` da VPS nas vars `HC_*`.
4. Code em `src/lib/healthchecks.ts` faz `GET` na URL ao final de cada job → check fica "up".

