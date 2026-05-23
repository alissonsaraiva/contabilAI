---
name: project_whatsapp_identity
description: Verificação de identidade no WhatsApp — decisão pendente sobre como garantir que é o cliente real na conversa
type: project
---

Pendente de decisão: como verificar que a pessoa no WhatsApp é realmente o cliente cadastrado (e não alguém com o celular roubado, WhatsApp Web aberto, SIM swap, etc.).

## Ameaças mapeadas
- Celular roubado/furtado → acesso total ao WhatsApp (risco alto)
- WhatsApp Web em computador compartilhado → sessão ativa sem o dono saber (risco médio, probabilidade alta)
- SIM swap → número migrado para outro chip (risco muito alto, probabilidade baixa)
- Familiar/colega usando o celular (geralmente sem má intenção)

## Dados sensíveis em risco
Boletos em aberto, vencimentos (DAS, DARF, IRPF), CPF/CNPJ, dados societários, status de documentos, informações de sócios.

## Opções levantadas (em ordem de esforço)

**Opção 1 — Restrição de escopo** (baixo esforço)
WhatsApp nunca envia dados financeiros ou pessoais completos — redireciona pro portal/email para qualquer dado sensível. Apenas dúvidas gerais de contabilidade.

**Opção 2 — PIN de sessão WhatsApp** (médio esforço, recomendada)
- Cliente cadastra PIN de 4-6 dígitos no portal
- Início de cada nova sessão (após 24h): IA pede o PIN antes de qualquer resposta
- `ConversaIA.verificadaEm` marcado por 24h após validação
- Sem PIN → só dúvidas gerais, sem dados da conta
- Requer: campo `whatsappPin` (hash) em `Cliente`, campo `verificadaEm`/`verificadoAte` em `ConversaIA`

**Opção 3 — OTP por e-mail cadastrado** (alto esforço, mais segura)
- Ao pedir dado sensível → IA dispara código de 6 dígitos pro e-mail cadastrado
- Código válido por 10 minutos
- Após verificação → sessão trusted por N horas
- Exige acesso simultâneo ao e-mail + celular (máxima segurança)

**Opção 4 — Pergunta com dado cadastrado** (baixo esforço, baixa proteção)
- Pergunta CPF/últimos 4 dígitos antes de dados sensíveis
- Fraco: dados podem estar acessíveis no mesmo celular

## Recomendação registrada
Implementar Opção 1 + Opção 2 em conjunto. Opção 3 como camada extra para clientes de alto valor.

**Why:** WhatsApp é o canal mais vulnerável — sem autenticação, qualquer pessoa com acesso ao número pode interagir com a IA que tem dados do cliente.
**How to apply:** Quando Alisson disser "vamos implementar verificação no WhatsApp", trazer estas opções e recomendar começar pela Opção 2 (PIN de sessão).
