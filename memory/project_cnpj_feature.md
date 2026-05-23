---
name: Feature CNPJ — Arquitetura e Integrações
description: Consulta pública de CNPJ via BrasilAPI — serviço reutilizável com cache, hook e integrações no onboarding e CRM (2026-03-28)
type: project
---

## Arquitetura (4 camadas)

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Serviço server | `src/lib/cnpj/index.ts` | Consulta BrasilAPI, cache in-process 24h (500 entradas), normaliza → `DadosCNPJ` |
| API proxy | `src/app/api/cnpj/[cnpj]/route.ts` | Endpoint público (sem auth), evita CORS, reutiliza cache do serviço |
| Hook React | `src/hooks/use-cnpj.ts` | `useCnpj()` — encapsula fetch + loading/erro, reutilizável em qualquer client component |
| Integrações | 3 componentes abaixo | Auto-preenchimento ao atingir 14 dígitos |

## Tipo normalizado `DadosCNPJ`

```typescript
type DadosCNPJ = {
  cnpj, razaoSocial, nomeFantasia, situacao,
  logradouro, numero, complemento, bairro, municipio, uf, cep,
  opcaoMei, opcaoSimples,
  regime: 'MEI' | 'SimplesNacional' | 'outro',
  atividadePrincipal
}
```

## Derivação de regime

- `opcao_pelo_mei = true` → `'MEI'`
- `opcao_pelo_simples = true` (e não MEI) → `'SimplesNacional'`
- else → `'outro'` (usuário preenche manualmente)

## Integrações ativas

### Onboarding (`src/app/(public)/onboarding/dados/page.tsx`)
- Trigger: onChange quando 14 dígitos atingidos
- Auto-preenche: `razaoSocial`, `enderecoEmpresa`, `numeroEmpresa`, `complementoEmpresa`, `bairroEmpresa`, `cidadeEmpresa`, `estadoEmpresa`, `cepEmpresa`
- Feedback: spinner inline + `toast.success('Dados da empresa preenchidos automaticamente')`

### Novo Cliente (`src/components/crm/novo-cliente-drawer.tsx`)
- Auto-preenche: `razaoSocial`, `cidade`, `uf`, `regime` (se MEI ou Simples)
- Spinner inline no campo CNPJ

### Editar Cliente (`src/components/crm/editar-cliente-drawer.tsx`)
- Mesmos campos que Novo Cliente
- Spinner inline no campo CNPJ

## Para adicionar em nova tela

```typescript
import { useCnpj } from '@/hooks/use-cnpj'

const { buscarCnpj, dados, loading, erro } = useCnpj()

// No onChange do CNPJ:
if (digits.length === 14) {
  const d = await buscarCnpj(digits)
  if (d) setForm(f => ({ ...f, razaoSocial: d.razaoSocial, ... }))
}
```

## Gaps identificados (não implementados)

- `nomeFantasia` não capturado no onboarding (API retorna, mas não há campo no form)
- `regime` não capturado no onboarding (há no CRM)
- Sem alerta de CNPJ inativo (`situacao !== 'ATIVA'`)

## Why

Implementado como feature de sistema (não tool de agente) pois é dado de formulário
frequente, crítico para precisão cadastral, e deve funcionar mesmo sem IA ativa.

**How to apply:** Usar `useCnpj()` em qualquer nova tela com campo CNPJ. A API `/api/cnpj/[cnpj]` é pública e sem auth.
