# ROTAS CRM — Endpoints de Suporte

> **Sistema:** AVOS v3.10.29 | **Revisado:** 2026-04-06
>
> Documenta rotas auxiliares que não se encaixam em um módulo funcional específico.

---

## Permissões de Menu (`/api/configuracoes/menu-permissoes`)

Gerencia quais menus cada perfil (contador, assistente) pode acessar. Admin exclusivo.

**Ver documentação completa:** [features/USUARIOS.md](./USUARIOS.md)

### `GET /api/configuracoes/menu-permissoes`
Retorna `{ menuPermissoes: { contador: string[], assistente: string[] } | null }`.

### `PATCH /api/configuracoes/menu-permissoes`
Body: `{ contador: string[], assistente: string[] }` — hrefs devem estar em `MENUS_DISPONIVEIS`.
`/crm/configuracoes` é removido silenciosamente mesmo que enviado.

---

## Dashboard (`GET /api/dashboard`)

Dados do painel principal do CRM. Autenticação obrigatória.

**Retorno:**
```json
{
  "totalClientes": 87,
  "leadsHoje": 3,
  "aguardandoAssinatura": 5,
  "inadimplentes": 12,
  "mrr": 19850.00
}
```

Calculado com `Promise.all` em consultas paralelas. MRR = soma de `valorMensal` de clientes ativos.

---

## CNPJ Lookup (`GET /api/cnpj/[cnpj]`)

Proxy público para consulta de CNPJ via **BrasilAPI**. Não requer autenticação.

- Valida: exatamente 14 dígitos
- **Cache**: in-process 24h + header `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600`
- `404`: CNPJ não encontrado
- `502`: BrasilAPI indisponível
- Usado pelo hook `useCnpj()` e telas de cadastro de empresa

---

## Upload Genérico (`POST /api/upload`)

Gera URL assinada de upload para o R2. Upload público para leads (onboarding), autenticado para escritório.

**Body:**
```json
{
  "tipo": "contrato | documento | rg | cpf | logo | favicon | ...",
  "entidadeId": "uuid",
  "entidadeTipo": "lead | cliente | escritorio",
  "contentType": "application/pdf"
}
```

**Tipos MIME permitidos**: PDF, JPEG, PNG, WebP, GIF, DOC/DOCX, XLS/XLSX, TXT, CSV, **XML** (`application/xml`, `text/xml` — para NFe, CT-e, NFS-e)

**Retorno:**
```json
{
  "uploadUrl": "https://...assinada",
  "publicUrl": "https://storage.../key",
  "key": "clientes/uuid/docs/tipo-abc123"
}
```

- `entidadeTipo === 'escritorio'` → requer `admin` ou `contador`
- Logo/favicon sempre sobrescreve a chave fixa (`storageKeys.logoEscritorio()`)

---

## Busca de Contatos (`GET /api/crm/contatos?q=...`)

Busca rápida unificada para o drawer "Nova mensagem" (WhatsApp). Mínimo 2 caracteres.

- **Clientes**: busca por nome, email, razão social (case-insensitive) — retorna até 8
- **Sócios**: busca por nome — retorna até 5, filtra os sem número de contato

**Retorno:**
```json
{
  "clientes": [{ "id", "nome", "whatsapp", "telefone", "empresa.razaoSocial" }],
  "socios":   [{ "id", "nome", "whatsapp", "telefone", "empresa.razaoSocial" }]
}
```

---

## Cobrança em Lote de Inadimplentes (`POST /api/crm/inadimplentes/mensagem`)

Envia mensagem de cobrança via WhatsApp para um ou mais clientes inadimplentes.

**Body:**
```json
{
  "clienteIds": ["uuid1", "uuid2"],
  "nivel": "gentil | urgente | reforco"
}
```

**Lógica:**
1. Busca configuração Evolution API do escritório
2. Para cada cliente: localiza cobrança Asaas com `status IN (PENDING, OVERDUE)`
3. Destinatário: sócio principal (se PJ) → cliente (CPF)
4. PIX incluído só se `pixCopiaECola` não expirou — usa `pixGeradoEm` (quando disponível) ou `atualizadoEm` como fallback; expira em 20h
5. Fallback: `linkBoleto` → mensagem pedindo contato
6. Registra `Interacao` tipo `whatsapp_enviado` por envio

**Templates de mensagem** por nível (gentil / urgente / reforço) com variáveis: nome, valor, data venc, forma de pagamento, nome do escritório.

**Retorno:**
```json
{ "ok": true, "enviados": 2, "erros": [{ "clienteId": "...", "ok": false, "erro": "Sem WhatsApp" }] }
```

---

## Portal — Session (`GET /api/portal/session`)

Retorna o `sessionId` canônico para o usuário do portal (cliente ou sócio). Armazenado no banco para persistir histórico de chat entre dispositivos.

**Fluxo:**
1. Se `portalSessionId` já existe no banco → retorna imediatamente
2. Procura conversa IA existente do cliente no canal `portal` (migração de histórico)
3. Se não encontra → gera `crypto.randomUUID()`
4. Usa `updateMany` com condição `null` para evitar race condition em chamadas simultâneas
5. Re-lê o valor salvo e retorna (garante consistência)

---

## Portal — Verificar Token (`GET /api/portal/verificar?token=xxx`)

Valida magic link e cria sessão JWT do portal. Redireciona para `/portal/dashboard`.

**Fluxo (corrigido 2026-04-04 — token só consumido após sessão criada):**
1. Hash SHA-256 do token → busca em `PortalToken`
2. Valida: existe, não usado (`usedAt == null`), não expirado
3. Para `cliente`: status deve ser `ativo` ou `inadimplente`
4. Para `sócio`: precisa ter `portalAccess == true`
5. Cria JWT (`auth/core/jwt`) com `{ id, name, email, tipo, empresaId }`
6. Seta cookie `PORTAL_COOKIE_NAME` (httpOnly, sameSite: lax, maxAge: 30 dias)
7. **Só após sucesso do JWT**: marca token como usado (`usedAt = now`)
   - Se `encode()` falhar, o token permanece válido e o usuário pode tentar de novo
8. Redireciona para `/portal/dashboard`

**Erros** (redirect para `/portal/login?erro=...`):
- `token_invalido` — não encontrado, já usado, sem cliente/sócio
- `token_expirado` — passou do prazo
- `conta_inativa` — cliente com status que não é ativo/inadimplente
- `acesso_negado` — sócio sem `portalAccess`

> Este é um Route Handler (não RSC) porque é o único lugar onde cookies podem ser setados server-side no Next.js 15+. A page `/portal/verificar` apenas redireciona para cá.

---

## Portal — Escalação (`POST /api/portal/escalacao`)

Cliente solicita atendimento humano pelo portal.

**Body:** `{ sessionId: string, motivo?: string }`

**Fluxo:**
1. Verifica se já existe escalação `pendente` para este cliente no canal `portal` (idempotência)
2. Cria/recupera conversa IA para o sessionId
3. Busca histórico atual da conversa
4. Cria `Escalacao` com canal `portal`, historico e ultimaMensagem
5. Indexa no RAG (fire-and-forget)
6. `notificarEscalacaoPortal()` — sino CRM + Sentry se falhar

**Retorno:** `{ ok: true, escalacaoId, jaExistia?: true }`

---

## Outros Endpoints de Suporte

| Rota | Método | Auth | Descrição |
|------|--------|------|-----------|
| `/api/historico` | GET | CRM | Feed de atividades: `tipo`, `clienteId`, `leadId`, `origem`, paginado |
| `/api/historico` | POST | CRM | Cria interação manualmente (nota, ligação, etc.) |
| `/api/badges` | GET | CRM | Contadores de badges da sidebar (notificações, escalações, etc.) |
| `/api/badges/atualizar` | POST | CRM | Força refresh dos badges |
| `/api/notificacoes` | GET | CRM | Lista notificações do user + `naolidas` count |
| `/api/notificacoes/[id]` | PATCH | CRM | Marca notificação como lida |
| `/api/usuarios` | GET | Admin | Listar usuários do CRM |
| `/api/usuarios` | POST | Admin | Criar usuário |
| `/api/usuarios/[id]` | PUT/DELETE | Admin | Editar/desativar usuário |
| `/api/planos` | GET | — | Listar planos do catálogo (público — usado no onboarding) |
| `/api/planos` | POST | Admin | Criar plano |
| `/api/trocar-senha` | POST | CRM | Trocar senha do usuário (requer senha atual) |
| `/api/escritorio` | GET | CRM | Dados do escritório (nome, logo, configurações) |
| `/api/escritorio` | PUT | Admin | Atualizar dados do escritório |
| `/api/validacoes/cpf` | GET | — | Valida dígitos verificadores CPF (público) |
| `/api/validacoes/cnpj` | GET | — | Valida formato CNPJ (público) |
| `/api/socios/[id]` | GET/PUT | CRM | Detalhe e atualização de sócio |
| `/api/crm/agente-acoes` | GET | CRM | Histórico de ações do agente operacional |
| `/api/crm/empresas` | GET/POST | CRM | Listagem e criação de empresa |
| `/api/crm/empresas/[id]` | GET/PUT | CRM | Detalhe e atualização de empresa |
| `/api/ai/stream` | POST | CRM | Stream de resposta IA para chat do CRM |
| `/api/stream/[id]` | GET | CRM | SSE para atualizações em tempo real |

---

## Hooks React (`src/hooks/`)

| Hook | Arquivo | Descrição |
|------|---------|-----------|
| `useAutoSave` | `use-auto-save.ts` | Auto-save com debounce para formulários do onboarding (endpoint público, sem auth) |
| `useBadges` | `use-badges.ts` | Polling de contadores da sidebar (escalações, notificações não lidas) |
| `useCep` | `use-cep.ts` | Auto-fill de endereço via CEP ao digitar 8 dígitos |
| `useCnpj` | `use-cnpj.ts` | Auto-fill de dados de empresa via CNPJ ao digitar 14 dígitos (usa `/api/cnpj/[cnpj]`) |
| `useMobile` | `use-mobile.ts` | Detecção de breakpoint mobile para layout responsivo |
