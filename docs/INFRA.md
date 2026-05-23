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

`/docker/postgres/docker-compose.yml`:

```yaml
services:
  postgresql:
    image: postgres:17
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

**Habilitar pgvector** (necessário para RAG):

```bash
docker exec -it <container> psql -U <user> -d contabil_ia -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

> Se a imagem `postgres:17` não tiver pgvector compilado, trocar para `pgvector/pgvector:pg17`.

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

Após migrations, a tabela `escritorio` está **vazia**. O app falha em vários pontos sem o registro. Inserir manualmente:

```sql
INSERT INTO escritorio (id, nome, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nome do Escritório', NOW(), NOW());
```

Depois logar no CRM em `https://crm.<dominio>` e preencher Configurações → Escritório, WhatsApp (URL + API key + instância), IA (API keys das LLMs), Storage. Essas configs ficam no banco encriptadas via `ENCRYPTION_KEY`.

Criar primeiro usuário admin pelo CRUD do banco ou pela rota de signup com role manual no banco.

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

O workflow em `.github/workflows/` (verificar arquivo atual) faz:

1. Build multi-stage da imagem
2. Push para `ghcr.io/<org>/contabilai-migrate:<tag>`
3. SSH na VPS:
   - `pg_dump` em `/home/deploy/contabai/backups/db-<tag>-<timestamp>.sql` (mantém últimos 10)
   - Pull da imagem → retag como `contabai:latest`
   - `prisma migrate deploy` via container migrator
   - `docker compose up -d --no-deps app`
   - `docker image prune -f`

Secrets necessários no repo GitHub:
- `SSH_PRIVATE_KEY` — chave do user `deploy`
- `SSH_HOST` — IP da VPS
- `GHCR_TOKEN` — PAT com `write:packages`

> **Deploy só dispara em tags `v*`.** Push para `main` não faz nada. Tagear: `git tag v3.x.y && git push origin v3.x.y`.

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
