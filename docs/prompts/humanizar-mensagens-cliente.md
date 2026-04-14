# Prompt: Humanizar mensagens do cliente (Portal + Onboarding)

> Cole este prompt diretamente no Claude Code para executar a análise e as melhorias.

---

## Tarefa

Analise **todos** os arquivos das áreas cliente-facing deste projeto e melhore as mensagens exibidas ao cliente final, tornando-as mais humanas, claras e acolhedoras — sem alterar lógica, estrutura de componentes ou comportamento da aplicação.

---

## Escopo — onde mexer

Analise **somente** estes caminhos:

```
src/app/(portal)/           ← portal autenticado + login + verificação
src/app/(public)/onboarding/ ← onboarding/cadastro público
src/components/portal/      ← componentes reutilizáveis do portal
src/components/onboarding/  ← componentes do onboarding
```

**Não alterar:**
- `src/app/(crm)/` — área do operador, fora do escopo
- `src/app/api/` — rotas de API
- Lógica de negócio, tipagem, imports, estrutura de componentes
- Textos que vêm de banco de dados ou de `getEscritorioConfig()`
- Nomes de planos (vêm da API com fallback — não alterar os fallbacks de nomes)

---

## O que analisar em cada arquivo

Para cada arquivo no escopo, identifique e melhore:

1. **Mensagens de erro** (toast.error, alerts, spans de validação)
2. **Mensagens de sucesso** (toast.success, confirmações)
3. **Empty states** (quando lista vazia, sem dados, sem histórico)
4. **Loading states** (textos de carregamento)
5. **Títulos e subtítulos de página/seção**
6. **Descrições explicativas** (parágrafos de instrução ao cliente)
7. **Labels de formulário e placeholders**
8. **Botões e CTAs**
9. **Mensagens de status** (pendente, em andamento, aguardando, etc.)
10. **Avisos e banners informativos**
11. **Mensagens de confirmação** (modais "tem certeza?")
12. **Textos de próximos passos** (ex: após assinatura do contrato)

---

## Critérios de humanização

### Tom e linguagem
- **Voz ativa, primeira ou segunda pessoa** — "Você não tem documentos ainda" em vez de "Nenhum documento encontrado"
- **Sem jargão técnico** — sem "request", "timeout", "não autorizado", "500", "null"
- **Direto e gentil** — sem ser excessivamente formal ou frio. O cliente é um empresário/MEI que espera suporte
- **Empático em erros** — o erro não é culpa do cliente. Começar com o que aconteceu, terminar com o que fazer

### Estrutura das mensagens

**Erros com causa conhecida:**
```
❌ "Erro ao carregar notas fiscais"
✅ "Não foi possível carregar suas notas. Tente recarregar a página."

❌ "Erro ao cancelar nota fiscal"
✅ "Não conseguimos cancelar a nota agora. Tente novamente ou fale com o escritório."

❌ "Erro de conexão. Tente novamente."
✅ "Problema de conexão. Verifique sua internet e tente novamente."
```

**Empty states:**
```
❌ "Nenhum documento encontrado"
✅ "Você ainda não tem documentos aqui. Seus arquivos enviados pelo escritório aparecerão nesta tela."

❌ "Nenhuma DAS disponível no momento."
✅ "Nenhuma DAS disponível agora. Caso precise de uma, fale com seu contador."

❌ "Nenhuma nota fiscal emitida ainda"
✅ "Você ainda não tem notas fiscais. Quando emitir a primeira, ela aparecerá aqui."
```

**Sucesso:**
```
❌ "Dados atualizados com sucesso!"
✅ "Dados salvos!"

❌ "Chamado aberto com sucesso!"
✅ "Chamado aberto! Nossa equipe responderá em breve."

❌ "Nota fiscal cancelada."
✅ "Nota fiscal cancelada com sucesso."
```

**Validação de formulário:**
```
❌ "Informe um e-mail ou WhatsApp válido"
✅ "Digite um e-mail ou número de WhatsApp válido para continuar."

❌ "Preencha o título e a descrição"
✅ "Adicione um título e descreva sua solicitação para abrir o chamado."

❌ "Confirme que leu e concorda com os termos."
✅ "Para continuar, confirme que leu e aceita os termos do contrato."
```

**Status:**
```
❌ "PENDENTE" / "EM_ANDAMENTO" / "AGUARDANDO_CLIENTE"
✅ "Pendente" / "Em andamento" / "Aguardando sua resposta"
```

**Avisos/banners:**
```
❌ "Há uma pendência financeira. Entre em contato com o escritório."
✅ "Você tem um pagamento em aberto. Entre em contato com o escritório para regularizar."

❌ "Sua conta está suspensa temporariamente. Entre em contato para regularizar."
✅ "Seu acesso está temporariamente suspenso. Fale com o escritório para resolver isso."
```

### Mensagens de autenticação/login
```
❌ "Nenhuma conta encontrada com esse e-mail."
✅ "Não encontramos uma conta com esse e-mail. Verifique se digitou corretamente."

❌ "Código incorreto ou expirado. Verifique e tente novamente."
✅ "Código incorreto ou expirado. Solicite um novo ou verifique sua caixa de entrada."

❌ "Sua conta está inativa. Entre em contato com o escritório."
✅ "Sua conta está inativa no momento. Fale com o escritório para reativar seu acesso."
```

---

## Regras obrigatórias

1. **Não alterar** textos que vêm de variáveis, props, ou dados dinâmicos do banco
2. **Não alterar** nomes de campos de formulário que têm correspondência direta com documentos fiscais (ex: "CNPJ", "CPF", "Inscrição Municipal" — são termos técnicos obrigatórios)
3. **Não encurtar** mensagens de segurança ou legais (termos de contrato, avisos de privacidade)
4. **Manter consistência** — se uma mensagem de erro usa "Tente novamente.", usar o mesmo padrão em mensagens similares no mesmo arquivo
5. **Não adicionar emojis** — o projeto não usa emojis nas mensagens
6. **Não alterar** lógica condicional, só o texto dentro de strings
7. **Português do Brasil** — manter o idioma existente
8. **Manter capitalização existente** — se estava em maiúsculas (ex: badge de status), manter

---

## Processo de execução

Para cada arquivo no escopo:

1. Leia o arquivo completo
2. Identifique todas as strings de UI visíveis ao cliente
3. Avalie quais precisam ser melhoradas segundo os critérios acima
4. Faça as alterações necessárias com `Edit`
5. Registre no resumo final o que foi alterado

Ao final, liste:
- Arquivos alterados
- Número de mensagens melhoradas por arquivo
- Exemplos das principais mudanças (antes → depois)

---

## Checklist pré-entrega

Após todas as alterações:
- [ ] `npx tsc --noEmit` — sem erros
- [ ] `npm run build` — build completo sem falhas
