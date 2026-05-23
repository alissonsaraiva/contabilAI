---
name: project_backlog_decisoes
description: Backlog de decisões e features pendentes para pensar depois — atualizar conforme itens forem sendo resolvidos
type: project
---

Referência central de tudo que foi identificado mas conscientemente deixado pra depois. Atualizar quando um item for decidido/implementado.

---

## 📋 Próximos passos a implementar (revertidos em 2026-03-28 — aguardando decisão final)

### Fluxo de documentos via WhatsApp + portal + email
Planejado e revertido para refinar. Decisões tomadas:
- WhatsApp = canal de notificação texto; PDF/OFX/XLS podem ser enviados com senha; XML/imagem = só portal+email
- Proteção: PDF com `qpdf`, OFX/XLS com `7z` AES-256 — senha configurada pelo cliente no portal
- Campo `senhaDocumentos String?` no `Cliente` (criptografado)
- Gemini para leitura de imagem/PDF enviado pelo cliente (multimodal, mais barato)
- IA confirma dados extraídos com o cliente antes de executar qualquer emissão
**O que implementar:**
1. `buscarDocumentos` — adicionar filtro `periodo` (ex: "novembro/2025")
2. `enviarEmail` — adicionar `documentoId?` para envio com anexo (Resend + SMTP)
3. Nova tool `solicitarDocumento(clienteId, tipo, periodo, descricao, tipoSolicitacao: 'nova'|'correcao', documentoIdReferencia?)` — cria OS, notifica WhatsApp
4. CRM `os-responder-form.tsx` — campo "Documento vinculado" (auto-dispatch ao resolver)
5. `PATCH /api/crm/ordens-servico/[id]` — ao resolver com `documentoId`: envia email com anexo + WhatsApp texto
6. Portal Configurações — campo "Senha para documentos no WhatsApp"
7. Função `protegerDocumento(buffer, mimeType, senha)` — `qpdf` para PDF, `7z` para outros
8. Dockerfile — `apt-get install qpdf p7zip-full`

### Debounce de mensagens WhatsApp (message batching)
Problema: IA responde a cada linha separada que cliente manda.
**Solução:** Desacoplar webhook do processamento AI.
1. `MensagemIA` — campo `aiProcessado Boolean @default(false)`
2. `ConversaIA` — campo `ultimaMensagemEm DateTime?`
3. Webhook: salva mensagem + mídia processada, NÃO chama IA, retorna 200
4. Cron a cada 4s: busca conversas com msgs não processadas onde `ultimaMensagemEm < now - 5s` → processa lote → responde

### Chamados unificados — deprecar Tarefas
Decisão: consolidar tudo em `OrdemServico` (chamados), remover modelo `Tarefa`.
- `OrdemServico` ganha `origem: 'cliente' | 'ia' | 'operador'` e `visivelPortal Boolean @default(true)`
- `TipoOS` ganha: `emissao_documento`, `correcao_documento`, `solicitacao_documento`, `tarefa_interna`
- Tools `criarTarefa`, `concluirTarefa`, `listarTarefas` → deprecar → tools OS absorvem
- Nova tool `criarOrdemServico(clienteId, tipo, titulo, descricao, origem, visivelPortal)`
- CRM: `/crm/tarefas` → migrar para `/crm/ordens-servico` filtrado por tipo
- Migração de dados: tasks existentes → OS com `tipo: tarefa_interna, visivelPortal: false`

### Portal Configurações — conteúdo a definir (oculto desde v3.10.34)
A página `/portal/configuracoes` existe mas foi removida do header (desktop + mobile) por não ter utilidade clara no momento.
**Decidir o que colocar antes de reativar.** Candidatos:
- Senha para documentos enviados via WhatsApp (ver item "Fluxo de documentos" acima)
- Preferências de notificação (WhatsApp, e-mail, push)
- Dados de contato / telefone do cliente
- Alterar senha/PIN de acesso ao portal

### Categorias de documentos no portal
- `CategoriaDocumento` enum: `geral`, `nota_fiscal`, `imposto_renda`, `guias_tributos`, `relatorios`, `outros`
- Campo `categoria CategoriaDocumento @default(geral)` no `Documento`
- Portal Documentos: tabs por categoria (público-alvo: MEI, autônomo, EPP)

### Capacidades dinâmicas no contexto da IA
- Em `ask.ts` ou route handlers: injetar automaticamente as tools disponíveis por canal no `systemExtra`
- Tools filtradas por `canais` + `toolsDesabilitadas` — IA sempre sabe o que pode fazer
- `registrarInteracao`: adicionar `'whatsapp'` aos canais
- `listarOrdensServico`: adicionar `'portal'` aos canais

---

## 🔐 Segurança

### WhatsApp — verificação de identidade do contato
**O problema:** Qualquer pessoa com acesso ao número (celular roubado, WhatsApp Web aberto, SIM swap) pode conversar com a IA e potencialmente receber dados do cliente.
**Opções mapeadas:**
- **Opção 1 (baixo esforço):** Restrição de escopo — WhatsApp nunca envia dados financeiros/pessoais, sempre redireciona pro portal
- **Opção 2 (recomendada):** PIN de sessão — cliente cadastra PIN no portal, IA pede a cada nova sessão (24h). Requer `whatsappPin` (hash) em `Cliente` + `verificadaEm/verificadoAte` em `ConversaIA`
- **Opção 3 (máxima segurança):** OTP por e-mail ao solicitar dado sensível
- **Opção 4 (fraca):** Pergunta com CPF/dado cadastrado
**Recomendação:** Opção 1 + 2 juntas.
**Ref:** `memory/project_whatsapp_identity.md`

### Rate limiting persistente (Redis)
**O problema:** Rate limiting atual é in-memory — reseta ao reiniciar o servidor, não escala se houver múltiplas instâncias.
**Solução:** Substituir `src/lib/rate-limit.ts` por implementação Redis quando o produto escalar.
**Impacto atual:** Baixo — deploy é single-instance na VPS.

### 2FA/MFA para admins
Login do CRM atualmente só tem email+senha com rate limit. Para produção com dados reais de clientes, considerar TOTP (Google Authenticator) para contas `admin`.

---

## 🏗️ Portal do Cliente

### ✅ Portal refatorado — IMPLEMENTADO (v3.2.0)
- /portal/empresa, /portal/documentos (upload+XML), /portal/suporte (OS+comunicados)
- /portal/suporte/os/nova + /[id] com avaliação, /portal/configuracoes
- Dashboard com quick actions, chamados recentes, comunicados
- PWA: manifest, service worker, banner de instalação
- CRM: /crm/ordens-servico + /crm/comunicados

### Pendente do portal
1. **Handoff Clara→humano:** Escalação clássica (##HUMANO## → `/atendimentos`) já existe. Melhorar experiência no portal.
2. **Notificação do operador quando OS é aberta:** Enviar email/notificação CRM quando cliente abre novo chamado.
3. **Notificações proativas ao cliente via WhatsApp/email:** quando OS é respondida.
**Ref:** `memory/project_portal_chat.md`

---

## 🤖 IA / Agente Operacional

### ✅ Agente com tool use — IMPLEMENTADO (v2.9.0)
27 tools: consulta, ações CRM, envio WhatsApp/email/contrato, agendamentos. Ver `memory/project_agente_operacional.md`.

### ✅ Tools portal no agente — IMPLEMENTADO (v3.2.0)
`listarOrdensServico`, `responderOrdemServico`, `publicarComunicado`.

### Missões proativas (contador aciona IA para pedir documento ao cliente)
**Contexto:** Contador abre um cliente no CRM, clica em "Pedir documento" e a IA envia a mensagem, aguarda resposta e faz follow-up até conseguir o que foi pedido.
**Arquitetura necessária:**
- `MissaoClara` model: `clienteId`, `tipo`, `descricao`, `status`, `prazo`, `tentativas`
- Webhook WhatsApp precisa reconhecer contexto de missão ativa ao receber mensagem do cliente
- Scheduler para follow-up automático (base do cron de agendamentos já existe)
**Status:** Passo futuro — implementar após action router de documentos estar pronto.

### Action router para documentos recebidos via WhatsApp
**Contexto:** Clientes enviam documentos (NF, contrato, extrato, boleto, holerite) via WhatsApp.
**Arquitetura decidida:**
```
documento recebido
  → extração raw (pdf-parse / visão)
  → LLM classifica + extrai campos (retorna JSON estruturado)
  → action router → responde cliente OU age no sistema
```
**Status:** Implementar camada de extração estruturada antes do action router.

### Agente cron — configurar na VPS
O endpoint `/api/agente/cron` existe mas o crontab da VPS ainda não foi configurado.
**Comando:** `*/1 * * * * curl -s -X POST https://dominio/api/agente/cron -H "x-cron-secret: $CRON_SECRET"`
**Status:** ⏳ Pendente — configurar na VPS quando for ao ar em produção real.

### Histórico de conversa WhatsApp multi-sessão
Hoje cada sessão WhatsApp é independente após 24h. Considerar agregar histórico de sessões anteriores do mesmo número para contexto mais rico.

### Rate limiting persistente para RAG
`listKnowledge` tem LIMIT 200 hoje. Para bases grandes, considerar paginação real.

---

## 💰 Open Finance (Pluggy)

### Integração bancária via Pluggy — planejado em 2026-03-28
Cliente conecta conta → transações chegam automaticamente → IA analisa → escritório entrega valor.
**Plano completo em:** `memory/project_openfinance_pluggy.md`

**Decisões abertas antes de implementar:**
1. Quem conecta a conta — escritório pelo CRM ou cliente sozinho no portal?
2. Escopo — só PJ (Empresa) ou também PF autônomo?
3. Fila assíncrona — `setImmediate` (simples) ou BullMQ (escalável)?
4. Tier Pluggy — quantos `items` simultâneos o plano suporta?

**O que vai ser criado:**
- 3 modelos Prisma: `PluggyConexao`, `PluggyAccount`, `PluggyTransacao`
- 2 campos encrypted no `Escritorio`: `pluggyClientId`, `pluggyClientSecret`
- `src/lib/pluggy/` — serviço + categorizer
- `src/app/api/pluggy/` + webhook `src/app/api/webhooks/pluggy/`
- 4 tools de IA: `consultar-saldo-cliente`, `listar-transacoes-cliente`, `resumo-financeiro-cliente`, `detectar-anomalias-financeiras`
- RAG tipo `dados_financeiros` (resumos mensais, não raw)
- Dashboard financeiro na aba "Financeiro" do drawer de cliente no CRM
- Extrato no portal do cliente
- Alertas proativos: WhatsApp + notificações CRM

**Status:** ⏳ Backlog — implementar em sprints futuros

---

## 🔗 Integrações

### Subdomain routing CRM + Portal
CRM em `crm.contabai.com.br` e Portal em `portal.contabai.com.br` (ou similar).
Sessões já são cookies separados (`authjs.session-token` vs `portal.session-token`).
Para concluir a separação por subdomínio:
1. Configurar DNS na VPS apontando os subdomínios para o mesmo app Next.js
2. nginx: roteia subdomínios → app; `proxy.ts` pode checar `req.headers.get('host')` se necessário
3. Adicionar `domain` nos cookies de cada auth (ex: `domain: '.contabai.com.br'` para cookie compartilhado OU domínio específico por instância)
4. Verificar redirect URI do Google OAuth no Google Cloud Console para incluir o novo subdomínio do portal
**Base pronta:** separação de auth já implementada em v2.9.2.

### SERPRO / Receita Federal
Consulta automatizada de CNPJ, situação no Simples Nacional, pendências fiscais.
**Status:** Passo 4+ do roadmap.

### Folha de pagamento automatizada
**Status:** Passo 4+ do roadmap.

---

## 💬 Comunicação com Sócios

### ✅ PWA portal — IMPLEMENTADO (v3.2.0)
manifest.webmanifest dinâmico, service worker (network-first), meta tags iOS/Android, banner de instalação. Ícones placeholder em public/icons/ — substituir por ícones reais do escritório.

### WhatsApp e canais de comunicação para sócios
Hoje a comunicação (WhatsApp, email) é centrada no Cliente titular. Sócios não têm canal próprio de comunicação no sistema.
**O que precisamos decidir:**
- Sócio tem número de WhatsApp próprio cadastrado → IA pode se comunicar diretamente?
- Notificações (DAS vencendo, documentos) vão para o titular ou para todos os sócios?
- Envio de contrato de alteração societária → para todos os sócios?
- Drawer de WhatsApp na tela da empresa deve listar titular + sócios para escolher com quem falar
**Arquitetura necessária:**
- `Socio` já tem campo `telefone` — usar como canal de WhatsApp direto
- Identificação no webhook: telefone do sócio → buscar via `socio.telefone` além de `cliente.telefone/whatsapp`
- `ConversaIA` pode precisar de `socioId` além de `clienteId`
**Status:** ⏳ Pendente — anotar para pensar junto com o módulo de comunicação da Empresa.

---

## 🚀 Produto / UX

### Site institucional (`contabai.com.br`)
Landing page pública com apresentação do escritório, serviços, preços e CTA para onboarding.
**Status:** ⏳ Pendente no Passo 1.

### Abertura de empresa 100% digital
Fluxo guiado para abertura de MEI/ME/EPP integrado com juntas comerciais.
**Status:** Passo 3 do roadmap.

### Notificações proativas ao cliente
Alertas automáticos via WhatsApp/email: DAS vencendo, IRPF chegando, documentos pendentes.
Depende de: agente cron (base já existe) + missões proativas.

### Player de áudio no histórico (WhatsApp drawer)
Áudios recebidos via WhatsApp são transcritos. Para ouvir o áudio original no drawer (diferente da conversa detail que já tem o player):
- Garantir que `whatsappMsgData` seja retornado pelo GET do drawer
- Renderizar `<audio>` quando `conteudo === '[áudio]'`
**Status:** Baixa prioridade.

---

## 🧾 NFS-e / Spedy

### Resync de endereço na Spedy quando cliente atualiza cidade/UF
`PATCH /api/crm/empresas/[id]` dispara `sincronizarEmpresaNaSpedy` quando CNPJ/regime/razão/nome muda, mas não quando o endereço do `Cliente` (cidade, UF, CEP, logradouro) muda.
O endereço é obrigatório no `PUT /companies/{id}` da Spedy. Se o cliente mudar de cidade depois de já estar cadastrado na Spedy, o endereço fica desatualizado lá.
**O que fazer:** detectar mudança de endereço no PATCH de cliente (`/api/crm/clientes/[id]`) e disparar resync da empresa vinculada se `spedyConfigurado = true`.
**Impacto atual:** Baixo — endereço é dado secundário na Spedy, não afeta emissão de NFS-e.

---

## 🔧 Tech Debt

### FK `Escalacao → ConversaIA`
Campo `conversaId` em `Escalacao` não existe — o histórico da escalação é uma cópia snapshot da conversa, não uma FK real. Resolver quando implementar o portal.

### Rate limiting Redis
Ver item em Segurança acima.

### Migrations baseline
O `prisma migrate` tem problema com o baseline vazio no ambiente atual — estamos usando `db push` + `migrate resolve`. Resolver quando estabilizar o schema pré-launch.
