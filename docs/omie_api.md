# Omie API — Documentação Completa para Integração

> **Portal do Desenvolvedor:** https://developer.omie.com.br  
> **Base URL:** `https://app.omie.com.br/api/v1/`  
> **Protocolo:** HTTP POST com corpo JSON  
> **Autenticação:** `app_key` + `app_secret` em todo request  
> **Versão atual:** v1

---

## 🔐 Autenticação e Estrutura de Request

### Credenciais
Crie um app em https://developer.omie.com.br/my-apps/ para obter `app_key` e `app_secret`.

### Estrutura padrão de Request (JSON)
```json
POST https://app.omie.com.br/api/v1/{modulo}/{servico}/
Content-Type: application/json

{
  "call": "NomeDoMetodo",
  "app_key": "0000000000",
  "app_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "param": [{ ...parâmetros específicos do método... }]
}
```

### Estrutura padrão de Response (sucesso)
```json
{
  ...campos do retorno específico do método...
}
```

### Estrutura de Erro
```json
{
  "faultstring": "Descrição do erro",
  "faultcode": "SOAP-ENV:Client-1234"
}
```
Ou no formato moderno:
```json
{
  "code": 123,
  "description": "Mensagem do erro",
  "referer": "Origem do erro",
  "fatal": false
}
```

### Paginação (padrão para listagens)
**Request:**
```json
{ "pagina": 1, "registros_por_pagina": 50 }
```
**Response:**
```json
{
  "pagina": 1,
  "total_de_paginas": 10,
  "registros": 50,
  "total_de_registros": 480
}
```

### Formatos suportados
| Formato | URL WSDL/Client |
|---------|----------------|
| JSON (recomendado) | `{endpoint}?PHPJSONCLIENT` |
| SOAP/XML | `{endpoint}?WSDL` |
| PHP SOAP | `{endpoint}?PHPSOAPCLIENT` |
| JavaScript (server-side) | `{endpoint}?JSJSONCLIENT` |

---

## 📋 MAPA GERAL DE TODOS OS MÓDULOS E APIs

| Módulo | Qtde de APIs |
|--------|-------------|
| Geral | 17 |
| CRM | 15 |
| Finanças | 12 |
| Compras, Estoque e Produção | 23 |
| Vendas e NF-e | 22 |
| Serviços e NFS-e | 19 |
| Painel do Contador | 2 |
| **Total** | **~148** |

---

---

# 🗂️ MÓDULO: GERAL

Cadastros compartilhados entre todos os módulos.

---

## API 1 — Clientes / Fornecedores / Transportadoras

**Endpoint:** `https://app.omie.com.br/api/v1/geral/clientes/`  
**Descrição:** Cria/edita/consulta o cadastro de clientes, fornecedores, transportadoras.

### Métodos

| Método | Descrição |
|--------|-----------|
| `IncluirCliente` | Inclui novo registro |
| `AlterarCliente` | Altera dados existentes |
| `ExcluirCliente` | Exclui o registro |
| `ConsultarCliente` | Consulta por chave |
| `ListarClientes` | Lista completa (todos os campos) |
| `ListarClientesResumido` | Lista resumida (campos básicos) |
| `UpsertCliente` | Inclui ou atualiza pelo código de integração |
| `UpsertClienteCpfCnpj` | Inclui ou atualiza pelo CPF/CNPJ |
| `AssociarCodIntCliente` | Associa código externo ao código Omie |
| `IncluirClientesPorLote` | ⚠️ DEPRECATED — inclusão em lote (máx 50) |
| `UpsertClientesPorLote` | ⚠️ DEPRECATED — upsert em lote (máx 50) |

### Tipo: `clientes_cadastro` (body principal)
```
codigo_cliente_omie          integer    Código interno Omie (gerado automaticamente)
codigo_cliente_integracao    string60   Código no seu sistema (chave de integração)
razao_social                 string60   ✅ OBRIGATÓRIO
cnpj_cpf                     string20   Obrigatório para NF-e/NFS-e (com ou sem formatação)
nome_fantasia                string100  Obrigatório para NF-e/NFS-e
email                        string500  Obrigatório para NF-e/NFS-e
telefone1_ddd                string5
telefone1_numero             string15
telefone2_ddd                string5
telefone2_numero             string15
fax_ddd                      string5
fax_numero                   string15
homepage                     string100
endereco                     string60   Obrigatório para NF-e/NFS-e
endereco_numero              string60   Obrigatório para NF-e/NFS-e
bairro                       string60   Obrigatório para NF-e/NFS-e
complemento                  string60
cidade                       string40   Nome ou código IBGE
cidade_ibge                  string7    Código IBGE (use nCodIBGE da API /geral/cidades/)
estado                       string2    Sigla do estado (SP, RJ, etc.)
cep                          string10   Obrigatório para NF-e/NFS-e
codigo_pais                  string4    Obrigatório para NF-e/NFS-e (use /geral/paises/)
separar_endereco             string1    S/N — separa número e complemento do endereço
pesquisar_cep                string1    S/N — preenche endereço pelo CEP automaticamente
inscricao_estadual           string20
inscricao_municipal          string20
inscricao_suframa            string20
optante_simples_nacional     string1    S/N — Obrigatório para NF-e/NFS-e
contribuinte                 string1    S/N — Obrigatório para NF-e/NFS-e
tipo_atividade               string1    Use /geral/tpativ/ para obter códigos
cnae                         string7    Use /produtos/cnae/
produtor_rural               string1    S/N
pessoa_fisica                string1    S/N — automático baseado no CPF/CNPJ
exterior                     string1    S/N — tomador no exterior
inativo                      string1    S/N
bloquear_faturamento         string1    S/N
bloquear_exclusao            string1    S/N
valor_limite_credito         decimal
observacao                   text
obs_detalhadas               text
nif                          string100  Número de Identificação Fiscal (apenas estrangeiros)
documento_exterior           string20   Documento no exterior
enviar_anexos                string1    S/N — envia anexos por e-mail
recomendacoes                object     Ver tipo recomendacoes abaixo
enderecoEntrega              object     Ver tipo enderecoEntrega abaixo
dadosBancarios               object     Ver tipo dadosBancarios abaixo
caracteristicas              array      [{campo: string30, conteudo: string60}]
tags                         array      [{tag: text}]
info                         object     Gerado automaticamente — datas/usuários inclusão/alteração
```

### Tipo: `recomendacoes`
```
numero_parcelas       string3    Parcelas padrão para vendas
codigo_vendedor       integer    Código do vendedor padrão
email_fatura          string200  E-mail alternativo para NF-e e boleto
gerar_boletos         string1    S/N — gerar boletos ao emitir NF-e
codigo_transportadora integer    Transportadora padrão
tipo_assinante        string1    Use /geral/tipoassinante/
```

### Tipo: `enderecoEntrega`
```
entRazaoSocial   string60
entCnpjCpf       string20
entEndereco      string60
entNumero        string60
entComplemento   string60
entBairro        string60
entCEP           string9
entEstado        string2
entCidade        string40
entTelefone      string15
entIE            string14   Inscrição Estadual
entSepararEndereco string1  S/N
```

### Tipo: `dadosBancarios`
```
codigo_banco      string3    Código do banco (use /financas/bancos/)
agencia           string10
conta_corrente    string25
doc_titular       string20   CPF ou CNPJ do titular
nome_titular      string60
transf_padrao     string1    S/N
cChavePix         string60   Chave PIX
```

### Tipo: `clientes_cadastro_chave` (para consultas)
```json
{ "codigo_cliente_omie": 12345 }
// ou
{ "codigo_cliente_integracao": "MEU-COD-001" }
```

### Tipo: `clientes_list_request` (para listagens)
```
pagina                    integer
registros_por_pagina      integer
apenas_importado_api      string1  S/N
filtrar_por_data_de       string10 dd/mm/aaaa
filtrar_por_data_ate      string10 dd/mm/aaaa
filtrar_por_hora_de       string8  hh:mm:ss
filtrar_por_hora_ate      string8  hh:mm:ss
filtrar_apenas_inclusao   string1  S/N
filtrar_apenas_alteracao  string1  S/N
exibir_caracteristicas    string1  S/N
exibir_obs                string1  S/N
clientesFiltro            object   {cnpj_cpf, razao_social, cidade, estado, inativo, ...}
clientesPorCodigo         array    [{codigo_cliente_omie, codigo_cliente_integracao}]
```

### Response: `clientes_status`
```json
{
  "codigo_cliente_omie": 12345,
  "codigo_cliente_integracao": "MEU-COD-001",
  "codigo_status": "0",
  "descricao_status": "Cliente incluído com sucesso!"
}
```

### Exemplos de Request

**IncluirCliente:**
```json
{
  "call": "IncluirCliente",
  "app_key": "...",
  "app_secret": "...",
  "param": [{
    "codigo_cliente_integracao": "CLI-001",
    "razao_social": "Empresa Exemplo Ltda",
    "cnpj_cpf": "12.345.678/0001-90",
    "nome_fantasia": "Empresa Exemplo",
    "email": "contato@empresa.com",
    "telefone1_ddd": "11",
    "telefone1_numero": "99999-9999",
    "endereco": "Rua das Flores",
    "endereco_numero": "100",
    "bairro": "Centro",
    "cidade": "São Paulo",
    "estado": "SP",
    "cep": "01310-100",
    "optante_simples_nacional": "N",
    "contribuinte": "S"
  }]
}
```

**ListarClientes:**
```json
{
  "call": "ListarClientes",
  "app_key": "...",
  "app_secret": "...",
  "param": [{
    "pagina": 1,
    "registros_por_pagina": 50,
    "filtrar_apenas_alteracao": "S",
    "filtrar_por_data_de": "01/04/2026",
    "filtrar_por_data_ate": "07/04/2026"
  }]
}
```

---

## API 2 — Clientes - Características

**Endpoint:** `https://app.omie.com.br/api/v1/geral/clientescaract/`  
**Descrição:** Cria/edita/consulta características (campos customizados) de clientes.

| Método | Descrição |
|--------|-----------|
| `IncluirCaracteristica` | Inclui nova característica |
| `AlterarCaracteristica` | Altera |
| `ExcluirCaracteristica` | Exclui |
| `ConsultarCaracteristica` | Consulta |
| `ListarCaracteristicas` | Lista todas |

---

## API 3 — Tags de Clientes

**Endpoint:** `https://app.omie.com.br/api/v1/geral/clientetag/`  
**Descrição:** Cria/edita/consulta tags usadas no cadastro de clientes/fornecedores.

| Método | Descrição |
|--------|-----------|
| `IncluirTag` | Inclui tag |
| `AlterarTag` | Altera |
| `ExcluirTag` | Exclui |
| `ConsultarTag` | Consulta |
| `ListarTags` | Lista todas |

---

## API 4 — Projetos

**Endpoint:** `https://app.omie.com.br/api/v1/geral/projetos/`  
**Descrição:** Cria/edita/consulta projetos para uso no rateio e relatórios.

| Método | Descrição |
|--------|-----------|
| `IncluirProjeto` | Inclui projeto |
| `AlterarProjeto` | Altera |
| `ExcluirProjeto` | Exclui |
| `ConsultarProjeto` | Consulta |
| `ListarProjetos` | Lista todos |

---

## APIs Auxiliares — Geral (somente consulta/listagem)

### API 5 — Empresas
**Endpoint:** `https://app.omie.com.br/api/v1/geral/empresas/`  

| Método | Descrição |
|--------|-----------|
| `ListarEmpresas` | Retorna dados da empresa cadastrada no Omie |

**Campos de retorno:** `nCodEmp`, `cCodEmpInt`, `cRazaoSocial`, `cNomeFantasia`, `cCNPJ`, `cEndereco`, `cCidade`, `cEstado`, `cCEP`, `cEmail`

---

### API 6 — Departamentos
**Endpoint:** `https://app.omie.com.br/api/v1/geral/departamentos/`  

| Método | Descrição |
|--------|-----------|
| `ListarDepartamentos` | Retorna lista de departamentos |

---

### API 7 — Categorias
**Endpoint:** `https://app.omie.com.br/api/v1/geral/categorias/`  
**Uso:** Cada lançamento financeiro, pedido ou OS precisa de uma categoria.

| Método | Descrição |
|--------|-----------|
| `ListarCategorias` | Retorna plano de categorias do Omie |

**Campos de retorno:** `codigo` (ex: `1.01.02`), `descricao`, `tipo` (R=Receita, D=Despesa)

---

### API 8 — Parcelas
**Endpoint:** `https://app.omie.com.br/api/v1/geral/parcelas/`  

| Método | Descrição |
|--------|-----------|
| `ListarParcelas` | Lista parcelas cadastradas |

---

### API 9 — Tipos de Atividade da Empresa
**Endpoint:** `https://app.omie.com.br/api/v1/geral/tpativ/`  

| Método | Descrição |
|--------|-----------|
| `ListarTipoAtiv` | Lista tipos de atividade |

---

### API 10 — CNAE
**Endpoint:** `https://app.omie.com.br/api/v1/produtos/cnae/`  

| Método | Descrição |
|--------|-----------|
| `ListarCNAE` | Lista códigos CNAE |

---

### API 11 — Cidades
**Endpoint:** `https://app.omie.com.br/api/v1/geral/cidades/`  

| Método | Descrição |
|--------|-----------|
| `PesquisarCidades` | Pesquisa cidades por nome/estado |
| `ListarEstados` | Lista estados com siglas |

**Request `PesquisarCidades`:**
```json
{ "cNomeCidade": "São Paulo", "cUF": "SP" }
```
**Campos de retorno:** `nCodIBGE`, `cNomeCidade`, `cUF`, `cCod`

---

### API 12 — Países
**Endpoint:** `https://app.omie.com.br/api/v1/geral/paises/`  

| Método | Descrição |
|--------|-----------|
| `ListarPaises` | Lista países |

**Campos de retorno:** `cCodigo`, `cDescricao`, `cCodigoISO`

---

### API 13 — Tipos de Anexos
**Endpoint:** `https://app.omie.com.br/api/v1/geral/tiposanexo/`  

| Método | Descrição |
|--------|-----------|
| `ListarTiposAnexo` | Consulta tipos de anexo disponíveis |

---

### API 14 — Documentos Anexos
**Endpoint:** `https://app.omie.com.br/api/v1/geral/anexo/`  
**Descrição:** CRUD completo de documentos anexados a registros.

| Método | Descrição |
|--------|-----------|
| `IncluirAnexo` | Inclui anexo |
| `AlterarAnexo` | Altera |
| `ConsultarAnexo` | Consulta |
| `ExcluirAnexo` | Exclui |

---

### API 15 — Tipo de Entrega
**Endpoint:** `https://app.omie.com.br/api/v1/geral/tiposentrega/`  

| Método | Descrição |
|--------|-----------|
| `IncluirTipoEntrega` | Inclui |
| `AlterarTipoEntrega` | Altera |
| `ConsultarTipoEntrega` | Consulta |
| `ExcluirTipoEntrega` | Exclui |

---

### API 16 — Tipo de Assinante
**Endpoint:** `https://app.omie.com.br/api/v1/geral/tipoassinante/`  

| Método | Descrição |
|--------|-----------|
| `ListarTipoAssinante` | Lista tipos (usado em NF via única, modelos 21/22) |

---

### API 17 — Conta Corrente (Cadastro)
**Endpoint:** `https://app.omie.com.br/api/v1/geral/contacorrente/`  
**Descrição:** CRUD do cadastro de contas correntes/caixas/investimentos.

| Método | Descrição |
|--------|-----------|
| `IncluirContaCorrente` | Inclui conta |
| `AlterarContaCorrente` | Altera |
| `ExcluirContaCorrente` | Exclui |
| `ConsultarContaCorrente` | Consulta |
| `ListarContasCorrentes` | Lista todas |

**Tipo `fin_conta_corrente_cadastro`:**
```
nCodCC              integer   Código interno (gerado)
cCodCCInt           string20  Código de integração
tipo_conta_corrente string2   CX=Caixa, CC=Conta Corrente, PP=Conta Pagamento, AC=Aplicação
codigo_banco        string3   Use /financas/bancos/ (999 = sem banco)
descricao           string60  ✅ Obrigatório
saldo_inicial       decimal
agencia             string10
conta               string25
nao_exibir_dre      string1   S/N
```

**Chave `fin_conta_corrente_chave`:**
```json
{ "nCodCC": 12345 }
// ou
{ "cCodCCInt": "CC-001" }
```

---

# 📊 MÓDULO: CRM

---

## API 18 — Contas (CRM)
**Endpoint:** `https://app.omie.com.br/api/v1/crm/contas/`  

| Método | Descrição |
|--------|-----------|
| `IncluirConta` | Inclui conta empresarial no CRM |
| `AlterarConta` | Altera |
| `ExcluirConta` | Exclui |
| `ConsultarConta` | Consulta |
| `ListarContas` | Lista todas |

---

## API 19 — Contas - Características (CRM)
**Endpoint:** `https://app.omie.com.br/api/v1/crm/contascaract/`  

| Método | Descrição |
|--------|-----------|
| `IncluirCaracteristica` | Inclui |
| `AlterarCaracteristica` | Altera |
| `ExcluirCaracteristica` | Exclui |
| `ConsultarCaracteristica` | Consulta |
| `ListarCaracteristicas` | Lista |

---

## API 20 — Contatos (CRM)
**Endpoint:** `https://app.omie.com.br/api/v1/crm/contatos/`  

| Método | Descrição |
|--------|-----------|
| `IncluirContato` | Inclui contato |
| `AlterarContato` | Altera |
| `ExcluirContato` | Exclui |
| `ConsultarContato` | Consulta |
| `ListarContatos` | Lista |

---

## API 21 — Oportunidades (CRM)
**Endpoint:** `https://app.omie.com.br/api/v1/crm/oportunidades/`  

| Método | Descrição |
|--------|-----------|
| `IncluirOportunidade` | Inclui oportunidade de venda |
| `AlterarOportunidade` | Altera |
| `ExcluirOportunidade` | Exclui |
| `ConsultarOportunidade` | Consulta |
| `ListarOportunidades` | Lista |

---

## API 22 — Oportunidades - Resumo
**Endpoint:** `https://app.omie.com.br/api/v1/crm/oportunidadesresumo/`  

| Método | Descrição |
|--------|-----------|
| `ListarResumo` | Resumo de oportunidades |

---

## API 23 — Tarefas (CRM)
**Endpoint:** `https://app.omie.com.br/api/v1/crm/tarefas/`  

| Método | Descrição |
|--------|-----------|
| `IncluirTarefa` | Inclui tarefa |
| `AlterarTarefa` | Altera |
| `ExcluirTarefa` | Exclui |
| `ConsultarTarefa` | Consulta |
| `ListarTarefas` | Lista |

---

## API 24 — Tarefas - Resumo (CRM)
**Endpoint:** `https://app.omie.com.br/api/v1/crm/tarefasresumo/`  

| Método | Descrição |
|--------|-----------|
| `ListarResumo` | Resumo de tarefas |

---

## APIs Auxiliares — CRM (somente listagem)

| API | Endpoint | Método | Descrição |
|-----|----------|--------|-----------|
| **Soluções** | `/crm/solucoes/` | `ListarSolucoes` | Soluções ofertadas |
| **Fases** | `/crm/fases/` | `ListarFases` | Fases da oportunidade |
| **Usuários** | `/crm/usuarios/` | `ListarUsuarios` | Usuários CRM |
| **Status** | `/crm/status/` | `ListarStatus` | Status de oportunidades |
| **Motivos** | `/crm/motivos/` | `ListarMotivos` | Motivos de conclusão |
| **Tipos** | `/crm/tipos/` | `ListarTipos` | Tipos de oportunidade |
| **Parceiros** | `/crm/parceiros/` | `ListarParceiros` | Parceiros e equipes |
| **Finders** | `/crm/finders/` | `ListarFinders` | Finders cadastrados |
| **Origens** | `/crm/origens/` | `ListarOrigens` | Origens de oportunidade |
| **Concorrentes** | `/crm/concorrentes/` | `ListarConcorrentes` | Concorrentes |
| **Verticais** | `/crm/verticais/` | `ListarVerticais` | Verticais atendidas |
| **Vendedores (CRM)** | `/crm/vendedores/` | `ListarVendedores` | Vendedores ativos |
| **Telemarketing** | `/crm/telemarketing/` | `ListarAtendentes` | Atendentes |
| **Pré-Vendas** | `/crm/prevendas/` | `ListarPreVendas` | Usuários pré-venda |
| **Tipos de Tarefas** | `/crm/tipotarefa/` | `Incluir/Alterar/Excluir/Consultar/Listar` | CRUD tipos de tarefa |

---

# 💰 MÓDULO: FINANÇAS

---

## API 25 — Contas Correntes — Lançamentos
**Endpoint:** `https://app.omie.com.br/api/v1/financas/contacorrentelancamentos/`  
**Descrição:** Cria/edita/consulta lançamentos avulsos na conta corrente.

| Método | Descrição |
|--------|-----------|
| `IncluirLancCC` | Inclui lançamento |
| `AlterarLancCC` | Altera |
| `ExcluirLancCC` | Exclui |
| `ConsultaLancCC` | Consulta |
| `ListarLancCC` | Lista lançamentos |

**Tipo `lanccAlterarRequest`:**
```
cCodIntLanc    string20  Código de integração do lançamento
cabecalho:
  nCodCC       integer   ✅ Código da conta corrente
  dDtLanc      string10  ✅ Data do lançamento (dd/mm/aaaa)
  nValorLanc   decimal   ✅ Valor (positivo=entrada, negativo=saída)
detalhes:
  cCodCateg    string20  Código da categoria
  cTipo        string3   Tipo: DIN, CHQ, CC, CD, BOL, PIX, TED
  nCodCliente  integer   Código do cliente/fornecedor
  cObs         text      Observação
```

**Exemplo IncluirLancCC:**
```json
{
  "call": "IncluirLancCC",
  "app_key": "...", "app_secret": "...",
  "param": [{
    "cCodIntLanc": "LANC-001",
    "cabecalho": {
      "nCodCC": 427619317,
      "dDtLanc": "07/04/2026",
      "nValorLanc": 500.00
    },
    "detalhes": {
      "cCodCateg": "1.01.02",
      "cTipo": "PIX",
      "nCodCliente": 2485994,
      "cObs": "Recebimento referente ao serviço X"
    }
  }]
}
```

---

## API 26 — Contas a Pagar — Lançamentos
**Endpoint:** `https://app.omie.com.br/api/v1/financas/contapagar/`  
**Descrição:** CRUD completo de títulos a pagar.

| Método | Descrição |
|--------|-----------|
| `IncluirContaPagar` | Inclui título |
| `AlterarContaPagar` | Altera título |
| `ExcluirContaPagar` | Exclui título |
| `ConsultarContaPagar` | Consulta título |
| `ListarContasPagar` | Lista títulos |
| `BaixarContaPagar` | Registra pagamento (baixa) |
| `CancelarPagamento` | Cancela pagamento registrado |

**Tipo `conta_pagar_cadastro`:**
```
codigo_lancamento_omie        integer   Código interno (gerado)
codigo_lancamento_integracao  string20  Código no seu sistema
codigo_cliente_fornecedor     integer   ✅ Código do fornecedor
data_vencimento               string10  ✅ dd/mm/aaaa
valor_documento               decimal   ✅ Valor do título
codigo_categoria              string20  Código da categoria (ex: "2.04.01")
data_previsao                 string10  Data prevista de pagamento
id_conta_corrente             integer   Conta para debitar o pagamento
numero_documento              string20  Número da NF ou título
observacao                    text
nao_gerar_boleto              string1   S/N
```

**Exemplo IncluirContaPagar:**
```json
{
  "call": "IncluirContaPagar",
  "app_key": "...", "app_secret": "...",
  "param": [{
    "codigo_lancamento_integracao": "CP-2026-001",
    "codigo_cliente_fornecedor": 4214850,
    "data_vencimento": "30/04/2026",
    "valor_documento": 1500.00,
    "codigo_categoria": "2.04.01",
    "data_previsao": "30/04/2026",
    "id_conta_corrente": 4243124,
    "numero_documento": "NF-000123"
  }]
}
```

---

## API 27 — Contas a Receber — Lançamentos
**Endpoint:** `https://app.omie.com.br/api/v1/financas/contareceber/`  
**Descrição:** CRUD completo de títulos a receber.

| Método | Descrição |
|--------|-----------|
| `IncluirContaReceber` | Inclui título |
| `AlterarContaReceber` | Altera título |
| `ExcluirContaReceber` | Exclui título |
| `ConsultarContaReceber` | Consulta |
| `ListarContasReceber` | Lista |
| `BaixarContaReceber` | Registra recebimento |
| `CancelarContaReceber` | Cancela recebimento |
| `AlterarDistribuicaoDepartamento` | Define rateio por departamento |

**Tipo `conta_receber_cadastro`:**
```
codigo_lancamento_omie        integer
codigo_lancamento_integracao  string20
codigo_cliente_fornecedor     integer   ✅ Código do cliente
data_vencimento               string10  ✅ dd/mm/aaaa
valor_documento               decimal   ✅
codigo_categoria              string20
data_previsao                 string10
id_conta_corrente             integer
numero_documento              string20
observacao                    text
```

---

## API 28 — Contas a Receber — Boletos
**Endpoint:** `https://app.omie.com.br/api/v1/financas/boletos/`

| Método | Descrição |
|--------|-----------|
| `GerarBoleto` | Gera boleto bancário para o título |
| `ObterBoleto` | Obtém linha digitável, código de barras e PDF |
| `ProrrogarBoleto` | Prorroga a data de vencimento |
| `CancelarBoleto` | Cancela o boleto emitido |

---

## API 29 — Contas a Receber — PIX
**Endpoint:** `https://app.omie.com.br/api/v1/financas/pix/`

| Método | Descrição |
|--------|-----------|
| `GerarPix` | Gera QR Code PIX para título (requer Omie.CASH ativo) |

---

## API 30 — Extrato de Conta Corrente
**Endpoint:** `https://app.omie.com.br/api/v1/financas/extrato/`

| Método | Descrição |
|--------|-----------|
| `ListarExtrato` | Retorna extrato com saldo e movimentações |

**Request:**
```json
{
  "nCodCC": 427619317,
  "cCodIntCC": "",
  "dPeriodoInicial": "01/04/2026",
  "dPeriodoFinal": "30/04/2026",
  "cExibirApenasSaldo": "N"
}
```

**Campos de retorno:**
```
nCodCC, cCodIntCC, nCodAgencia, nCodBanco, cDescConta
lancamentos[]:
  nCodLanc        Código interno
  dDtLanc         Data dd/mm/aaaa
  nValorLanc      Valor
  cDescrLanc      Descrição
  cTipo           Tipo (DIN, PIX, TED...)
  nSaldoAcumulado Saldo após o lançamento
```

---

## API 31 — Orçamento de Caixa
**Endpoint:** `https://app.omie.com.br/api/v1/financas/orcamento/`

| Método | Descrição |
|--------|-----------|
| `ListarOrcamento` | Previsto x Realizado por período |

---

## API 32 — Pesquisar Títulos
**Endpoint:** `https://app.omie.com.br/api/v1/financas/pesquisartitulos/`

| Método | Descrição |
|--------|-----------|
| `PesquisarTitulos` | Busca consolidada de títulos a pagar e receber |

---

## API 33 — Movimentos Financeiros
**Endpoint:** `https://app.omie.com.br/api/v1/financas/movimentos/`

| Método | Descrição |
|--------|-----------|
| `ListarMovimentos` | Consulta de pagamentos, baixas e lançamentos em CC |

---

## APIs Auxiliares — Finanças (somente consulta)

| API | Endpoint | Método | Retorno |
|-----|----------|--------|---------|
| **Bancos** | `/financas/bancos/` | `ListarBancos` | Código banco (3 dígitos), nome |
| **Tipos de Documento** | `/financas/tiposdocumento/` | `ListarTiposDocumento` | Códigos de tipos de doc financeiro |
| **Tipos de Contas** | `/financas/tiposcc/` | `ListarTiposCC` | Tipos de contas correntes |
| **Contas do DRE** | `/financas/contasdre/` | `ListarContasDRE` | Plano de contas do DRE |
| **Finalidade Transferência** | `/financas/finalidadetransferencia/` | `ListarFinalidades` | Finalidades CNAB |
| **Origem dos Títulos** | `/financas/origentitulos/` | `ListarOrigens` | Origens possíveis de títulos |
| **Bandeiras de Cartão** | `/financas/bandeirascartao/` | `ListarBandeiras` | Bandeiras de débito/crédito |

---

# 🛒 MÓDULO: COMPRAS, ESTOQUE E PRODUÇÃO

---

## API 34 — Produtos — Cadastro
**Endpoint:** `https://app.omie.com.br/api/v1/geral/produtos/`

| Método | Descrição |
|--------|-----------|
| `IncluirProduto` | Inclui produto |
| `AlterarProduto` | Altera |
| `ExcluirProduto` | Exclui |
| `ConsultarProduto` | Consulta |
| `ListarProdutos` | Lista todos |
| `AssociarCodIntProduto` | Associa código externo ao código Omie |
| `UpsertProduto` | Inclui ou atualiza |

**Tipo `produto_servico_cadastro`:**
codigo_familia              integer   Use /geral/familias/
descricao_detalhada         text      Descrição completa
ean                         string14  Código de barras EAN/GTIN
altura                      decimal
largura                     decimal
profundidade                decimal
peso_liq                    decimal
peso_bruto                  decimal
bloqueado                   string1   S/N — bloqueia venda
inativo                     string1   S/N
importado_api               string1   S/N (automático)
exibir_descricao_nfe        string1   S/N

Chave produto_servico_cadastro_chave:
json{ "codigo_produto": 12345 }
// ou
{ "codigo_produto_integracao": "SKU-001" }
Exemplo IncluirProduto:
{
  "call": "IncluirProduto",
  "app_key": "...", "app_secret": "...",
  "param": [{
    "codigo_produto_integracao": "SKU-001",
    "codigo": "P001",
    "descricao": "Caixa de Papelão 30x20",
    "unidade": "UN",
    "ncm": "48191000",
    "valor_unitario": 5.90,
    "tipoItem": "01",
    "peso_liq": 0.250,
    "peso_bruto": 0.300
  }]
}
API 35 — Produtos — Características
Endpoint: https://app.omie.com.br/api/v1/geral/produtoscaract/
MétodoDescriçãoIncluirCaracteristicaIncluiAlterarCaracteristicaAlteraExcluirCaracteristicaExcluiConsultarCaracteristicaConsultaListarCaracteristicasLista

API 36 — Produtos — Estrutura (Lista de Materiais)
Endpoint: https://app.omie.com.br/api/v1/geral/produtosestrutura/
MétodoDescriçãoConsultarEstruturaConsulta a estrutura (composição) do produto

API 37 — Produtos — Kit
Endpoint: https://app.omie.com.br/api/v1/geral/produtoskit/
MétodoDescriçãoEditarKitEdita a composição do kit de produtos

API 38 — Produtos — Variação
Endpoint: https://app.omie.com.br/api/v1/produtos/variacao/
MétodoDescriçãoIncluirVariacaoInclui variação (cor, tamanho, etc.)ConsultarVariacaoConsultaListarVariacoesLista variações

API 39 — Produtos — Lote
Endpoint: https://app.omie.com.br/api/v1/produtos/produtoslote/
MétodoDescriçãoConsultarLoteConsulta lote específicoListarLotesLista lotes do produto

API 40 — Requisições de Compra
Endpoint: https://app.omie.com.br/api/v1/produtos/requisicaocompra/
MétodoDescriçãoIncluirRequisicaoInclui requisição de compraAlterarRequisicaoAlteraExcluirRequisicaoExcluiConsultarRequisicaoConsultaListarRequisicoesLista

API 41 — Pedidos de Compra
Endpoint: https://app.omie.com.br/api/v1/produtos/pedidocompra/
MétodoDescriçãoIncluirPedCompraInclui pedido de compraAlteraPedCompraAltera pedidoExcluirPedCompraExcluiConsultarPedCompraConsultaListarPedCompraLista pedidosFaturarPedCompraFatura (gera nota de entrada)
Estrutura do pedido de compra:
json{
  "cabecalho": {
    "cCodIntPed": "PC-001",
    "dDtPrevisao": "30/04/2026",
    "nCodFor": 14170458,
    "cCodCateg": "2.04.01",
    "nCodCC": 1208238,
    "cObs": "Pedido de compra mensal"
  },
  "frete": {
    "nCodTransp": 0,
    "cTpFrete": "9",
    "cPlaca": "XXX-9999",
    "cUF": "SP",
    "nQtdVol": 5
  },
  "itens": [
    {
      "nCodProd": 123456,
      "cCodProdInt": "SKU-001",
      "nQtde": 10,
      "nValUnit": 50.00
    }
  ]
}
```

**Tipos de frete (`cTpFrete`):**
```
0 = Emitente  1 = Destinatário  2 = Terceiros  9 = Sem frete

API 42 — Ordens de Produção
Endpoint: https://app.omie.com.br/api/v1/produtos/op/
MétodoDescriçãoIncluirOPInclui ordem de produçãoAlterarOPAlteraExcluirOPExcluiConsultarOPConsultaListarOPLista

API 43 — Nota de Entrada
Endpoint: https://app.omie.com.br/api/v1/produtos/notaentrada/
MétodoDescriçãoIncluirNotaInclui NF de entrada manualmenteAlterarNotaAlteraExcluirNotaExcluiConsultarNotaConsultaListarNotasLista notas de entrada

API 44 — Nota de Entrada — Faturamento
Endpoint: https://app.omie.com.br/api/v1/produtos/notaentradafat/
MétodoDescriçãoFaturarNotaFatura nota de entradaCancelarFaturamentoCancela faturamentoConsultarFaturamentoConsulta status do faturamento

API 45 — Recebimento de Nota Fiscal
Endpoint: https://app.omie.com.br/api/v1/produtos/recebimentonfe/
MétodoDescriçãoEditarRecebimentoEdita dados do recebimento físico da NF-e

API 46 — Resumo de Compras
Endpoint: https://app.omie.com.br/api/v1/produtos/compras-resumo/
MétodoDescriçãoObterResumoResumo consolidado do módulo de compras

API 47 — Estoque — Ajustes
Endpoint: https://app.omie.com.br/api/v1/estoque/ajustes/
MétodoDescriçãoIncluirAjusteInclui movimentação de ajuste de estoqueExcluirAjusteExclui ajuste

API 48 — Estoque — Consulta
Endpoint: https://app.omie.com.br/api/v1/estoque/consultar/
MétodoDescriçãoConsultarEstoquePosição consolidada do estoque de um produto
Request:
json{ "nCodProd": 123456, "cCodProdInt": "SKU-001" }
```
**Retorno:** quantidade disponível, reservada, localização por local de estoque.

---

## API 49 — Estoque — Movimentos
**Endpoint:** `https://app.omie.com.br/api/v1/estoque/movimento/`

| Método | Descrição |
|--------|-----------|
| `ListarMovimentos` | Lista movimentos de entrada/saída por período |

---

## API 50 — Locais de Estoque
**Endpoint:** `https://app.omie.com.br/api/v1/estoque/locais/`

| Método | Descrição |
|--------|-----------|
| `ListarLocais` | Listagem dos locais de estoque cadastrados |

---

## API 51 — Resumo do Estoque
**Endpoint:** `https://app.omie.com.br/api/v1/estoque/resumo/`

| Método | Descrição |
|--------|-----------|
| `ObterResumo` | Resumo do estoque de um produto |

---

## APIs Auxiliares — Compras/Estoque/Produção

| API | Endpoint | Método | Descrição |
|-----|----------|--------|-----------|
| **Famílias de Produto** | `/geral/familias/` | `Incluir/Alterar/Excluir/Consultar/Listar` | CRUD famílias |
| **Unidades** | `/geral/unidades/` | `ListarUnidades` | Unidades de medida |
| **Compradores** | `/estoque/comprador/` | `ListarCompradores` | Lista compradores |
| **Produto x Fornecedor** | `/estoque/produtofornecedor/` | `ListarRelacoes` | Relação produto-fornecedor |
| **Formas de Pagamento (Compras)** | `/produtos/formaspagcompras/` | `ListarFormasPag` | Formas de pagamento p/ compras |
| **NCM** | `/produtos/ncm/` | `ListarNCM`, `ConsultarNCM` | Nomenclatura Comum do Mercosul |
| **Cenário de Impostos** | `/produtos/cenarioimpostos/` | `ListarCenarios` | Cenários tributários |
| **CFOP** | `/produtos/cfop/` | `ListarCFOP` | Códigos CFOP |
| **ICMS - CST** | `/produtos/icmscst/` | `ListarICMSCST` | Tabela CST do ICMS |
| **ICMS - CSOSN** | `/produtos/icmscsosn/` | `ListarICMSCSOSN` | Tabela CSOSN (Simples) |
| **ICMS - Origem** | `/produtos/icmsorigem/` | `ListarOrigens` | Origens da mercadoria |
| **PIS - CST** | `/produtos/piscst/` | `ListarPISCST` | Tabela CST PIS |
| **COFINS - CST** | `/produtos/cofinscst/` | `ListarCOFINSCST` | Tabela CST COFINS |
| **IPI - CST** | `/produtos/ipicst/` | `ListarIPICST` | Tabela CST IPI |
| **IPI - Enquadramento** | `/produtos/ipienq/` | `ListarEnquadramento` | Enquadramentos IPI |
| **Tipo de Cálculo** | `/produtos/tpcalc/` | `ListarTiposCalculo` | Tipos de cálculo de impostos |
| **CEST** | `/produtos/cest/` | `ListarCEST` | Código Especificador da ST |

---

# 🛍️ MÓDULO: VENDAS E NF-e

---

## API 52 — Pedidos de Venda — Resumido
**Endpoint:** `https://app.omie.com.br/api/v1/produtos/pedidovenda/`  
**Descrição:** Versão simplificada para inclusão rápida de pedidos de venda.

| Método | Descrição |
|--------|-----------|
| `IncluirPedido` | Inclui pedido (versão simplificada) |
| `AlterarPedido` | Altera |
| `ExcluirPedido` | Exclui |
| `ConsultarPedido` | Consulta |
| `ListarPedidos` | Lista resumida |

---

## API 53 — Pedidos de Venda (Completo)
**Endpoint:** `https://app.omie.com.br/api/v1/produtos/pedido/`  
**Descrição:** CRUD completo de pedidos de venda com todos os campos.

| Método | Descrição |
|--------|-----------|
| `IncluirPedidoVenda` | Inclui pedido de venda completo |
| `AlterarPedidoVenda` | Altera pedido |
| `ExcluirPedidoVenda` | Exclui pedido |
| `ConsultarPedidoVenda` | Consulta pedido completo |
| `ListarPedidosVenda` | Lista pedidos com filtros |
| `AlterarPedFaturado` | Altera pedido já faturado (rastreio, previsão, obs) |

**Estrutura `pedido_venda_produto`:**
```
cabecalho:
  codigo_pedido_integracao  string20  Código no seu sistema
  codigo_pedido             integer   Código interno (gerado)
  codigo_cliente            integer   ✅ Código do cliente
  data_previsao             string10  ✅ dd/mm/aaaa
  etapa                     string2   Etapa do pedido (ver tabela abaixo)
  bloqueado                 string1   S/N
  quantidade_itens          integer
  numero_pedido_cliente     string30  Número do pedido do cliente

det[]:
  ide:
    codigo_item_integracao  string20
  produto:
    codigo_produto          integer
    codigo_produto_integracao string60
    quantidade              decimal   ✅
    valor_unitario          decimal   ✅
    tipo_desconto           string1   V=Valor, P=Percentual
    desconto                decimal
    cfop                    string10
    codigo_local_estoque    integer
  inf_adic:
    nao_gerar_financeiro    string1   S/N

informacoes_adicionais:
  codigo_categoria          string20  ✅
  codigo_conta_corrente     integer
  codigo_vendedor           integer
  consumidor_final          string1   S/N
  enviar_email              string1   S/N
  obs_venda                 text
  codigo_projeto            integer

frete:
  modalidade                string1   0-9
  codigo_transportadora     integer
  placa_veiculo             string7
  uf_veiculo                string2
  quantidade_volumes        integer
  peso_bruto                decimal

parcelas[]:
  parcela                   integer   Número da parcela
  percentual                decimal
  data                      string10
  valor                     decimal
  forma_pagamento           string
  numero_banco              string
```

**Etapas do pedido:**
```
10 = Pedido em Aberto (aguardando aprovação)
20 = Aprovado (pronto para faturar)
50 = Faturado (NF-e emitida)
60 = Cancelado
Exemplo IncluirPedidoVenda:
json{
  "call": "IncluirPedidoVenda",
  "app_key": "...", "app_secret": "...",
  "param": [{
    "cabecalho": {
      "codigo_pedido_integracao": "PV-2026-001",
      "codigo_cliente": 3792227,
      "data_previsao": "30/04/2026",
      "etapa": "10"
    },
    "det": [{
      "ide": { "codigo_item_integracao": "ITEM-01" },
      "produto": {
        "codigo_produto": 123456,
        "quantidade": 5,
        "valor_unitario": 99.90
      }
    }],
    "informacoes_adicionais": {
      "codigo_categoria": "1.01.02",
      "codigo_conta_corrente": 4243124,
      "consumidor_final": "N"
    }
  }]
}

API 54 — Pedidos de Venda — Faturamento
Endpoint: https://app.omie.com.br/api/v1/produtos/pedidovendafat/
Descrição: Operações de faturamento (emissão/cancelamento de NF-e).
MétodoDescriçãoFaturarPedidoVendaFatura pedido (emite NF-e)CancelarFaturamentoCancela NF-e emitidaConsultarFaturamentoConsulta status do faturamento
Request FaturarPedidoVenda:
json{
  "codigo_pedido": 0,
  "codigo_pedido_integracao": "PV-2026-001"
}

API 55 — Pedidos de Venda — Etapas
Endpoint: https://app.omie.com.br/api/v1/produtos/pedidoetapas/
MétodoDescriçãoListarEtapasLista etapas disponíveis de faturamentoConsultarEtapaConsulta etapa específica

API 56 — CT-e / CT-e OS (Conhecimento de Transporte)
Endpoint: https://app.omie.com.br/api/v1/produtos/cte/
MétodoDescriçãoAdicionarCTeAdiciona conhecimento de transporteCancelarCTeCancela CT-e emitido

API 57 — Remessa de Produtos
Endpoint: https://app.omie.com.br/api/v1/produtos/remessa/
MétodoDescriçãoIncluirRemessaCria NF de remessa de produtosAlterarRemessaAlteraConsultarRemessaConsultaExcluirRemessaExclui

API 58 — Remessa — Faturamento
Endpoint: https://app.omie.com.br/api/v1/produtos/remessafat/
MétodoDescriçãoFaturarRemessaFatura remessa (emite NF-e)CancelarFaturamentoCancelaConsultarFaturamentoConsulta status

API 59 — Resumo de Vendas
Endpoint: https://app.omie.com.br/api/v1/produtos/vendas-resumo/
MétodoDescriçãoObterResumoResumo consolidado de NF-e, CT-e e Cupom Fiscal

API 60 — Obter Documentos (PDF/XML de NF-e, CT-e, Cupom)
Endpoint: https://app.omie.com.br/api/v1/produtos/dfedocs/
Descrição: Disponibiliza PDF e XML de documentos fiscais.
MétodoDescriçãoObterNfeXML e DANFE da NF-eObterDanfeSimpDANFE simplificadoObterCTeXML e DACTE do CT-eObterCupomXML do Cupom FiscalObterPedVendaPDF do pedido de venda
Request:
json{ "nIdNfe": 123456 }
// ou para CT-e:
{ "nIdCTe": 123456 }
Retorno: cLinkXml (URL do XML), cLinkDanfe (URL do PDF)

API 61 — Cupom Fiscal — Adicionar
Endpoint: https://app.omie.com.br/api/v1/produtos/cupomfiscalincluir/
MétodoDescriçãoAdicionarCupomAdiciona cupom fiscal / NFC-e / CF-e SAT

API 62 — Cupom Fiscal — Cancelar/Excluir
Endpoint: https://app.omie.com.br/api/v1/produtos/cupomfiscal/
MétodoDescriçãoCancelarCupomCancela cupom fiscalExcluirCupomExclui cupomInutilizarCupomInutiliza numeração

API 63 — Cupom Fiscal — Consultar
Endpoint: https://app.omie.com.br/api/v1/produtos/cupomfiscalconsultar/
MétodoDescriçãoConsultarCupomConsulta cupom fiscalListarCuponsLista cupons com filtros

API 64 — Importar NFC-e
Endpoint: https://app.omie.com.br/api/v1/produtos/nfce/
MétodoDescriçãoImportarNFCeImportação de XML de NFC-e

API 65 — Importar CFe-SAT
Endpoint: https://app.omie.com.br/api/v1/produtos/sat/
MétodoDescriçãoImportarCFeSatImportação de XML de CF-e SAT

API 66 — NF-e — Consultas
Endpoint: https://app.omie.com.br/api/v1/produtos/nfconsultar/
Descrição: Listagem e consulta de NF-e emitidas.
MétodoDescriçãoConsultarNFConsulta NF-e por chaveListarNFLista NF-e com filtros avançados
Chave nfChave:
json{ "nCodNF": 0, "nNF": "1" }
// ou por chave NF-e:
{ "cChaveNFe": "35260400000000000000550010000000011234567890" }
```

**Filtros `nfListarRequest`:**
```
pagina, registros_por_pagina
ordenar_por          CODIGO | INTEGRACAO | DATA_LANCAMENTO
ordem_decrescente    S/N
filtrar_por_data_de  string10  dd/mm/aaaa
filtrar_por_data_ate string10
dEmiInicial          string10  Data de emissão inicial
dEmiFinal            string10  Data de emissão final
dSaiEntInicial       string10  Data saída/entrada inicial
dSaiEntFinal         string10
filtrar_por_status   string1   N=Não cancelada, C=Cancelada
tpNF                 string1   0=Entrada, 1=Saída
tpAmb                string1   1=Produção, 2=Homologação
cSerie               string5
nNFInicial           integer
nNFFinal             integer
nIdCliente           integer
cnpj_cpf             string100
opPedido             string2   Operação: 11=Venda Produto, 01=Venda Serviço, 21=Compra, etc.
cApenasResumo        string1   S/N
cDetalhesPedido      string1   S/N
```

**Campos de retorno `nfCadastro`:**
```
ide:
  nNF          Número da NF-e
  serie        Série
  dEmi         Data emissão
  dSaiEnt      Data saída/entrada
  tpNF         0=Entrada, 1=Saída
  tpAmb        1=Produção, 2=Homologação
  cChaveNFe    Chave de acesso (44 dígitos)
  mod          Modelo (55=NF-e, 65=NFC-e)
  finNFe       1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução
  dReg         Data de registro SEFAZ
  dCan         Data de cancelamento

det[]:
  prod:
    cProd, xProd, NCM, CFOP, uCom, qCom, vUnCom, vProd
    pICMS, vICMS, pIPI, vIPI, pPIS, vPIS, pCOFINS, vCOFINS
    pISS, vISS, vDesc, vFrete

total:
  ICMSTot: { vBC, vICMS, vBCST, vST, vProd, vFrete, vSeg, vDesc, vNF, vTotTrib }
  ISSQNtot: { vServ, vBC, vISS, vPIS, vCOFINS }
  retTrib: { vRetPIS, vRetCOFINS, vRetCSLL, vIRRF, vRetPrev }

titulos[]:
  nCodTitulo, cNumTitulo, dDtEmissao, dDtVenc, nValorTitulo, cCodCateg

pedido:
  cNumPedido, opPedido, nIdVendedor, nIdProjeto

API 67 — NF-e — Utilitários
Endpoint: https://app.omie.com.br/api/v1/produtos/notafiscalutil/
MétodoDescriçãoObterURLNFeRecupera URL do XML, do DANFE ou do logotipo

API 68 — NF-e — Importar XML
Endpoint: https://app.omie.com.br/api/v1/produtos/nfe/
MétodoDescriçãoImportarNFeImportação de XML de NF-e de terceiros

APIs Auxiliares — Vendas
APIEndpointMétodoDescriçãoVendedores (Vendas)/produtos/vendedores/Incluir/Alterar/Excluir/Consultar/ListarCRUD vendedoresFormas de Pagamento/produtos/formaspagvendas/ListarFormasPagFormas de pagamento de pedidosTabela de Preços/produtos/tabelaprecos/Incluir/Alterar/Excluir/Consultar/ListarCRUD tabelas de preçoCaracterísticas Produtos/produtos/caracteristicas/Incluir/Alterar/Excluir/Consultar/ListarCaracterísticas para produtosNCM/produtos/ncm/ListarNCM, ConsultarNCMCódigos NCMEtapas de Faturamento/produtos/etapafat/ListarEtapasEtapas do faturamentoCenário de Impostos/produtos/cenarioimpostos/ListarCenariosCenários tributáriosMeios de Pagamento/produtos/meiosdepagamento/ListarMeiosMeios de pagamento (parcelas)Origem do Pedido/produtos/origempedido/ListarOrigensOrigens de pedidosMotivos de Devolução/produtos/motivosdevolucao/ListarMotivosMotivos de devolução

🔧 MÓDULO: SERVIÇOS E NFS-e

API 69 — Serviços (Cadastro)
Endpoint: https://app.omie.com.br/api/v1/servicos/servico/
Descrição: CRUD do cadastro de serviços prestados pela empresa.
MétodoDescriçãoIncluirCadastroServicoInclui serviçoAlterarCadastroServicoAlteraExcluirCadastroServicoExcluiConsultarCadastroServicoConsultaListarCadastroServicosLista todos
Estrutura srvEditarRequest:
json{
  "intEditar": { "cCodIntServ": "SRV-001", "nCodServ": 0 },
  "descricao": { "cDescrCompleta": "Descrição completa do serviço" },
  "cabecalho": {
    "cDescricao": "Nome do Serviço",
    "cCodigo": "S001",
    "cIdTrib": "",
    "cCodServMun": "01015",
    "cCodLC116": "7.07",
    "nIdNBS": "",
    "nPrecoUnit": 150.00,
    "cCodCateg": "1.01.02"
  },
  "impostos": {
    "nAliqISS": 2.5,   "cRetISS": "N",
    "nAliqPIS": 0.65,  "cRetPIS": "N",
    "nAliqCOFINS": 3,  "cRetCOFINS": "N",
    "nAliqCSLL": 1,    "cRetCSLL": "N",
    "nAliqIR": 1.5,    "cRetIR": "N",
    "nAliqINSS": 0,    "cRetINSS": "N"
  }
}

API 70 — Ordens de Serviço
Endpoint: https://app.omie.com.br/api/v1/servicos/os/
Descrição: CRUD completo de Ordens de Serviço.
MétodoDescriçãoIncluirOSInclui OSAlterarOSAlteraExcluirOSExcluiConsultarOSConsulta OS completaListarOSLista com filtros
Estrutura osCadastro:
json{
  "Cabecalho": {
    "nCodOS": 0,
    "cCodIntOS": "OS-001",
    "cCodParc": "999",
    "cEtapa": "10",
    "dDtPrevisao": "30/04/2026",
    "nCodCli": 2485994,
    "nQtdeParc": 1
  },
  "InformacoesAdicionais": {
    "cCidPrestServ": "SAO PAULO (SP)",
    "cCodCateg": "1.01.02",
    "cDadosAdicNF": "Dados adicionais da NFS-e",
    "nCodCC": 11850365,
    "nCodProj": 0,
    "nCodVend": 0
  },
  "ServicosPrestados": [{
    "cCodServLC116": "7.07",
    "cCodServMun": "01015",
    "cDescServ": "Consultoria em TI",
    "cDadosAdicItem": "Detalhes do serviço",
    "nQtde": 1,
    "nValUnit": 2000.00,
    "cRetemISS": "N",
    "nCodIntServico": "SRV-001",
    "nCodServico": 123456
  }],
  "Departamentos": [],
  "Email": {
    "cEnvBoleto": "N",
    "cEnvLink": "N",
    "cEnviarPara": "cliente@email.com"
  }
}
```

**Etapas da OS:**
```
10 = Em Aberto
20 = Em Andamento
50 = Faturada
60 = Cancelada

API 71 — Ordens de Serviço — Faturamento
Endpoint: https://app.omie.com.br/api/v1/servicos/osp/
MétodoDescriçãoFaturarOSFatura a OS (emite NFS-e)CancelarOSCancela OS/NFS-eDuplicarOSDuplica uma OS existenteAssociarCodIntOSAssocia código de integraçãoConsultarFaturamentoConsulta status
Request FaturarOS:
json{ "cCodIntOS": "OS-001", "nCodOS": 0 }

API 72 — Ordens de Serviço — Faturamento em Lote
Endpoint: https://app.omie.com.br/api/v1/servicos/oslote/
MétodoDescriçãoFaturarOSEmLoteFatura múltiplas OS de uma vez

API 73 — Contratos de Serviço
Endpoint: https://app.omie.com.br/api/v1/servicos/contrato/
Descrição: CRUD de contratos de serviço recorrentes.
MétodoDescriçãoIncluirContratoInclui contratoAlterarContratoAlteraExcluirContratoExcluiConsultarContratoConsultaListarContratosLista contratos
Estrutura contratoCadastro:
json{
  "cabecalho": {
    "cCodIntCtr": "CTR-001",
    "cCodSit": "10",
    "cNumCtr": "2026/001",
    "cTipoFat": "01",
    "dVigInicial": "01/01/2026",
    "dVigFinal": "31/12/2026",
    "nCodCli": 2370765,
    "nDiaFat": 30,
    "nValTotMes": 3000.00
  },
  "infAdic": {
    "cCidPrestServ": "SAO PAULO (SP)",
    "cCodCateg": "1.01.02",
    "nCodCC": 1208238,
    "nCodProj": 0,
    "nCodVend": 0
  },
  "servicos": [{
    "cCodServLC116": "7.07",
    "cCodServMun": "01015",
    "cDescServ": "Manutenção Mensal",
    "nValMes": 3000.00,
    "nQtde": 1
  }],
  "emailCliente": {
    "cEnviarBoleto": "S",
    "cEnviarLinkNfse": "S",
    "cUtilizarEmails": "contato@empresa.com"
  }
}
```

**Situações do contrato (`cCodSit`):**
```
10 = Ativo
50 = Cancelado

API 74 — Contratos de Serviço — Faturamento
Endpoint: https://app.omie.com.br/api/v1/servicos/contratofat/
MétodoDescriçãoFaturarContratoFatura competência do contratoCancelarFaturamentoCancela faturamentoConsultarFaturamentoConsulta status

API 75 — Contratos de Serviço — Faturamento em Lote
Endpoint: https://app.omie.com.br/api/v1/servicos/contratolote/
MétodoDescrição
| `FaturarContratosEmLote` | Fatura múltiplos contratos de uma vez |
| `ConsultarLote` | Consulta status do lote de faturamento |

---

## API 76 — Resumo de Serviços
**Endpoint:** `https://app.omie.com.br/api/v1/servicos/resumo/`

| Método | Descrição |
|--------|-----------|
| `ObterResumo` | Resumo consolidado do faturamento de serviços |

---

## API 77 — Obter Documentos (PDF/XML de NFS-e, OS, Recibo)
**Endpoint:** `https://app.omie.com.br/api/v1/servicos/osdocs/`  
**Descrição:** Disponibiliza PDF e XML de documentos fiscais do módulo de serviços.

| Método | Descrição |
|--------|-----------|
| `ObterNFSe` | PDF e XML da NFS-e |
| `ObterOS` | PDF da Ordem de Serviço |
| `ObterRPS` | PDF do RPS (Recibo Provisório de Serviços) |
| `ObterRecibo` | PDF do Recibo |
| `ObterDemonst` | PDF do Demonstrativo |

**Request (todos os métodos):**
```json
{ "nIdNf": 123456 }
// para OS:
{ "nIdOs": 123456 }
```
**Retorno:** `cLinkPDF` (URL do PDF), `cLinkXml` (URL do XML)

---

## API 78 — NFS-e — Consultas
**Endpoint:** `https://app.omie.com.br/api/v1/servicos/nfse/`  
**Descrição:** Listagem de NFS-e emitidas.

| Método | Descrição |
|--------|-----------|
| `ListarNFSEs` | Lista NFS-e com filtros avançados |

**Filtros `nfseListarRequest`:**
```
nPagina                integer
nRegPorPagina          integer
dEmiInicial            string10  dd/mm/aaaa
dEmiFinal              string10
hEmiInicial            string8   hh:mm:ss
hEmiFinal              string8
nNumeroNFSe            string20
cSerieNFSe             string10
cAmbienteNFSe          string1   H=Homologação, P=Produção
cStatusNFSe            string1   F=Faturada, C=Cancelada, N=Não faturada
nCodigoCliente         integer
cCodigoCategoria       string20
nCodigoCC              integer
nCodigoProjeto         integer
nCodigoVendedor        integer
nCodigoOS              integer
nCodigoContrato        integer
cNumeroContrato        string60
cExibirDepartamentos   string1   S/N
cExibirDescricao       string1   S/N
```

**Campos de retorno `nfseEncontradas`:**
```
Cabecalho:
  nNumeroNFSe           Número da NFS-e
  cSerieNFSe            Série
  nValorNFSe            Valor
  cStatusNFSe           F/C/N
  cCodigoVerifNFSe      Código de verificação
  cAmbienteNFSe         H/P
  cCidadeEmissor        Cidade do emissor
  cCNPJEmissor, cIMEmissor
  cCNPJDestinatario, cIMDestinatario
  nCodigoCliente

OrdemServico:
  nCodigoOS, nNumeroOS, nValorOS, nCodigoContrato

RPS:
  nNumeroLote, nStatusLote, nNumeroRPS, cStatusRPS, cSerieRPS, cDataRPS

Servicos[]:
  CidadePrestacao, CodigoLC116, CodigoServico
  nQuantidade, nValorUnitario, nValorServico, nValorTotal
  nAliquotaISS, nValorISS, cRetISS
  nAliquotaIR, nValorIR, cRetIR
  nAliquotaPIS, nValorPIS, cRetPIS
  nAliquotaCOFINS, nValorCOFINS, cRetCOFINS
  nAliquotaCSLL, nValorCSLL, cRetCSLL
  nAliquotaINSS, nValorINSS, cRetINSS
  cDescricao

Valores:
  nValorTotalServicos, nValorBaseCalculo, nValorDeducao
  nValorISS, nAliquotaISS, cIssRetido
  nValorPIS, nValorCOFINS, nValorIR, nValorINSS, nValorCSLL
  nValorLiquido

IBPT:
  CodigoNBS, nValorFederalIBPT, nValorEstadualIBPT, nValorMunicipalIBPT
```

---

## APIs Auxiliares — Serviços

| API | Endpoint | Método | Descrição |
|-----|----------|--------|-----------|
| **Vendedores (Serviços)** | `/servicos/vendedores/` | `Incluir/Alterar/Excluir/Consultar/Listar` | CRUD vendedores |
| **Serviços no Município** | `/servicos/listaservico/` | `ListarServMunic` | Lista códigos de serviço do município |
| **Tipos de Tributação** | `/servicos/tipotrib/` | `ListarTipoTrib` | Tipos de tributação ISS |
| **LC 116** | `/servicos/lc116/` | `ListarLC116` | Códigos da Lei Complementar 116 |
| **NBS** | `/servicos/nbs/` | `ListarNBS` | Nomenclatura Brasileira de Serviços |
| **IBPT** | `/servicos/ibpt/` | `ListarIBPT` | Tabela de impostos IBPT |
| **Formas de Pagamento** | `/servicos/formaspagamento/` | `ListarFormasPag` | Formas de pagamento |
| **Tipo de Faturamento Contrato** | `/servicos/contratotpfat/` | `ListarTiposFat` | Tipos de faturamento de contratos |
| **Etapas de Faturamento** | `/servicos/etapafat/` | `ListarEtapas` | Etapas do faturamento |
| **Tipo de Utilização** | `/servicos/tipoutilizacao/` | `ListarTipos` | Tipos de utilização |
| **Classificação do Serviço** | `/servicos/classificacaoservico/` | `ListarClassificacoes` | Classificações do serviço |

**Detalhes `ListarServMunic`:**
```
Retorno por registro:
  nIdCodServMun   integer   ID interno
  cCodServMun     string20  Código municipal do serviço
  cDescricao      string300 Descrição resumida
  cDescrCompleta  text      Descrição completa
  cCodServLC116   string10  Código LC116 correspondente
  cCidade         string40  Cidade
```

---

# 🧾 MÓDULO: PAINEL DO CONTADOR

---

## API 79 — Documentos Fiscais (XMLs)
**Endpoint:** `https://app.omie.com.br/api/v1/contador/xml/`  
**Descrição:** Listagem de XMLs de NF-e, NFC-e, CF-e SAT e NFS-e para escritórios contábeis.

| Método | Descrição |
|--------|-----------|
| `ListarDocumentos` | Lista XMLs de documentos fiscais por período e modelo |

**Request `xmlListarDocumentosRequest`:**
```json
{
  "nPagina": 1,
  "nRegPorPagina": 20,
  "cModelo": "55",
  "dEmiInicial": "01/04/2026",
  "dEmiFinal": "30/04/2026"
}
```

**Modelos disponíveis (`cModelo`):**
```
55  = NF-e
65  = NFC-e
SAT = CF-e SAT
SE  = NFS-e
```

**Campos de retorno `documentosEncontrados`:**
```
nNumero      string10  Número do documento
cSerie       string10  Série
nChave       string44  Chave de acesso
dEmissao     string10  Data de emissão
hEmissao     string8   Hora de emissão
nValor       decimal   Valor do documento
cXml         text      Conteúdo XML completo
nIdCupom     integer   ID do cupom (se for NFC-e/SAT)
```

---

## API 80 — Resumo do Fechamento Contábil
**Endpoint:** `https://app.omie.com.br/api/v1/contador/resumo/`

| Método | Descrição |
|--------|-----------|
| `ObterResumoContador` | Resumo do fechamento contábil por período |

**Request:**
```json
{
  "dDataInicio": "01/04/2026",
  "dDataFim": "30/04/2026"
}
```

**Retorno `ObterResumoContadorResponse`:**
```
dDataInicio, dDataFim
listaFechamentoContabil[]:
  dDataInicio     string10
  dDataFim        string10
  cSituacao       string10   Status do fechamento contábil
  ...totais e valores do período
```

---

---

# 📐 REFERÊNCIA TÉCNICA COMPLETA

---

## Tipos de Dados

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `integer` | Número inteiro | `12345` |
| `decimal` | Decimal com ponto | `99.90` |
| `string{N}` | String com tamanho máximo N | `"texto"` |
| `text` | String sem limite | `"descrição longa"` |
| `string1` | Flag S/N ou código de 1 char | `"S"` ou `"N"` |
| `string10` | Data no formato dd/mm/aaaa | `"07/04/2026"` |
| `string8` | Hora no formato hh:mm:ss | `"14:30:00"` |
| `boolean` | Verdadeiro/falso | `true` ou `false` |

---

## Paginação — Boas Práticas
```javascript
// Exemplo de loop de paginação completa
async function listarTodos(call, params) {
  let pagina = 1;
  let total = 0;
  let todos = [];
  const POR_PAGINA = 50;

  do {
    const response = await omieRequest(call, {
      ...params,
      pagina,
      registros_por_pagina: POR_PAGINA
    });
    todos = todos.concat(response.clientes_cadastro || response.registros || []);
    total = response.total_de_paginas;
    pagina++;
  } while (pagina <= total);

  return todos;
}
```

---

## Filtros por Data/Hora — Padrão de Sincronização Incremental

Para sincronização incremental (somente alterações recentes):
```json
{
  "pagina": 1,
  "registros_por_pagina": 50,
  "filtrar_apenas_alteracao": "S",
  "filtrar_por_data_de": "07/04/2026",
  "filtrar_por_hora_de": "00:00:00",
  "filtrar_por_data_ate": "07/04/2026",
  "filtrar_por_hora_ate": "23:59:59"
}
```

---

## Códigos de Integração — Estratégia

A Omie usa dois identificadores para cada registro:

| Campo | Tipo | Quem define | Uso |
|-------|------|-------------|-----|
| `codigo_*_omie` / `nCod*` | integer | Omie (automático) | ID interno Omie |
| `codigo_*_integracao` / `cCodInt*` | string | Seu sistema | ID externo (seu sistema) |

**Recomendação:** sempre armazene o `codigo_*_omie` retornado após criar um registro para consultas futuras rápidas. Use `UpsertCliente`, `UpsertProduto` etc. para evitar duplicações.

---

## Tratamento de Erros
```javascript
// Verificar erro no response
function checkError(response) {
  if (response.faultstring) {
    throw new Error(`[${response.faultcode}] ${response.faultstring}`);
  }
  if (response.code && response.code !== 0) {
    throw new Error(`[${response.code}] ${response.description} (ref: ${response.referer})`);
  }
  // Verificar status em operações de CRUD
  if (response.codigo_status && response.codigo_status !== '0') {
    throw new Error(`[${response.codigo_status}] ${response.descricao_status}`);
  }
}
```

**Códigos de status comuns:**
```
0    = Sucesso
1000 = Registro não encontrado
1001 = Registro já existe
2000 = Campo obrigatório não informado
5000 = Erro de autenticação (app_key/app_secret inválidos)
```

---

## Exemplo de Cliente HTTP (Node.js)
```javascript
const axios = require('axios');

const APP_KEY = 'SEU_APP_KEY';
const APP_SECRET = 'SEU_APP_SECRET';
const BASE_URL = 'https://app.omie.com.br/api/v1';

async function omieRequest(endpoint, call, params) {
  const url = `${BASE_URL}/${endpoint}/`;
  const body = {
    call,
    app_key: APP_KEY,
    app_secret: APP_SECRET,
    param: [params]
  };

  try {
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;

    // Tratar erro Omie
    if (data.faultstring) {
      throw new Error(`Omie Error [${data.faultcode}]: ${data.faultstring}`);
    }
    if (data.code && data.code !== 0) {
      throw new Error(`Omie Error [${data.code}]: ${data.description}`);
    }

    return data;
  } catch (err) {
    if (err.response) {
      throw new Error(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

// Uso
const cliente = await omieRequest('geral/clientes', 'ConsultarCliente', {
  codigo_cliente_integracao: 'CLI-001'
});
```

---

## Exemplo de Cliente HTTP (Python)
```python
import requests
import json

APP_KEY = 'SEU_APP_KEY'
APP_SECRET = 'SEU_APP_SECRET'
BASE_URL = 'https://app.omie.com.br/api/v1'

def omie_request(endpoint, call, params):
    url = f"{BASE_URL}/{endpoint}/"
    body = {
        "call": call,
        "app_key": APP_KEY,
        "app_secret": APP_SECRET,
        "param": [params]
    }
    response = requests.post(url, json=body)
    data = response.json()

    if 'faultstring' in data:
        raise Exception(f"Omie Error [{data['faultcode']}]: {data['faultstring']}")
    if data.get('code') and data['code'] != 0:
        raise Exception(f"Omie Error [{data['code']}]: {data['description']}")

    return data

# Uso
cliente = omie_request('geral/clientes', 'ConsultarCliente', {
    'codigo_cliente_integracao': 'CLI-001'
})
```

---

## Rate Limiting e Boas Práticas

- **Sem limite de requisições documentado**, mas recomenda-se no máximo ~3-5 req/segundo para evitar throttling.
- Para **grandes volumes**, use os métodos de Lote (`PorLote`) onde disponíveis (máx. 50 registros/lote).
- Para **sincronização**, prefira filtros de `filtrar_apenas_alteracao` com janela de tempo incremental.
- O campo `info.dAlt` / `info.hAlt` de cada registro indica a última alteração — use para delta sync.
- Respostas de listagem com `total_de_paginas` = 0 indicam nenhum resultado.

---

## Ambientes

| Ambiente | URL Base |
|----------|----------|
| Produção | `https://app.omie.com.br/api/v1/` |
| Homologação | Não há ambiente separado — use `tpAmb: "2"` em NF-e para testes fiscais |

---

## Webhooks

A Omie **possui webhooks nativos** configuráveis por aplicativo no painel do desenvolvedor.

> **Referência:** https://ajuda.omie.com.br/pt-BR/articles/5412754-utilizando-os-webhooks-no-omie

### Como configurar

1. Acessar https://developer.omie.com.br/ (requer perfil **Administrador**)
2. Navegar até **Aplicativos** → selecionar o app
3. Clicar em **"Adicionar novo webhook"**
4. Colar a URL do endpoint de callback (ex: `https://app.avos.digital/api/integracoes/omie/webhook`)
5. Ativar os webhooks desejados na listagem exibida
6. Clicar em **Salvar**

> **Importante:** As configurações do webhook só terão efeito para **novas sessões** do Omie. Após salvar, a Omie envia automaticamente uma **notificação de teste** para a URL configurada.

### Eventos conhecidos

A lista completa de eventos está disponível no painel ao configurar. Eventos documentados incluem:

| Evento (provável) | Descrição |
|---|---|
| `produto.incluido` | Produto criado |
| `produto.alterado` | Produto alterado |
| `produto.excluido` | Produto excluído |
| `cliente.incluido` | Cliente criado |
| `cliente.alterado` | Cliente alterado |
| `cliente.excluido` | Cliente excluído |
| `ordem_servico.incluida` | OS criada |
| `ordem_servico.alterada` | OS alterada |
| `ordem_servico.faturada` | OS faturada (NFS-e emitida) |
| `conta_receber.incluida` | Título a receber criado |
| `conta_receber.liquidada` | Título recebido (baixa) |
| `conta_pagar.incluida` | Título a pagar criado |
| `conta_pagar.liquidada` | Título pago (baixa) |
| `nfse.emitida` | NFS-e emitida |
| `nfe.emitida` | NF-e emitida |

> **⚠️ ATENÇÃO:** Os nomes acima são inferidos — a lista exata deve ser verificada no painel do developer ao configurar o webhook. Capturar payloads reais com RequestBin antes de implementar.

### Formato do payload (a investigar)

A documentação pública não detalha o formato exato do payload JSON enviado nos webhooks. Antes de implementar:

1. Criar app de teste no painel Omie
2. Configurar webhook apontando para https://requestbin.com ou similar
3. Disparar eventos manualmente (criar/alterar cliente, emitir OS, etc.)
4. Capturar e documentar: headers HTTP, body JSON, mecanismo de autenticação/assinatura

### Estratégia recomendada para integração AVOS

```
Fluxo principal: event-driven via webhooks
  Omie → POST /api/integracoes/omie/webhook → processar evento

Fallback: cron de reconciliação 1x/dia (madrugada)
  AVOS → ListarClientes(filtrar_apenas_alteracao=S) → sync delta
  AVOS → ListarNFSEs(dEmiInicial=ontem) → sync docs
```

Isso elimina polling frequente e garante sync quase em tempo real, com reconciliação diária como safety net.

---

## Índice Rápido de Todos os Endpoints

| # | Nome | Endpoint | Módulo |
|---|------|----------|--------|
| 1 | Clientes/Fornecedores/Transportadoras | `/geral/clientes/` | Geral |
| 2 | Clientes - Características | `/geral/clientescaract/` | Geral |
| 3 | Tags de Clientes | `/geral/clientetag/` | Geral |
| 4 | Projetos | `/geral/projetos/` | Geral |
| 5 | Empresas | `/geral/empresas/` | Geral |
| 6 | Departamentos | `/geral/departamentos/` | Geral |
| 7 | Categorias | `/geral/categorias/` | Geral |
| 8 | Parcelas | `/geral/parcelas/` | Geral |
| 9 | Tipos de Atividade | `/geral/tpativ/` | Geral |
| 10 | CNAE | `/produtos/cnae/` | Geral |
| 11 | Cidades | `/geral/cidades/` | Geral |
| 12 | Países | `/geral/paises/` | Geral |
| 13 | Tipos de Anexos | `/geral/tiposanexo/` | Geral |
| 14 | Documentos Anexos | `/geral/anexo/` | Geral |
| 15 | Tipo de Entrega | `/geral/tiposentrega/` | Geral |
| 16 | Tipo de Assinante | `/geral/tipoassinante/` | Geral |
| 17 | Conta Corrente (Cadastro) | `/geral/contacorrente/` | Geral |
| 18 | Contas (CRM) | `/crm/contas/` | CRM |
| 19 | Contas - Características (CRM) | `/crm/contascaract/` | CRM |
| 20 | Contatos (CRM) | `/crm/contatos/` | CRM |
| 21 | Oportunidades | `/crm/oportunidades/` | CRM |
| 22 | Oportunidades - Resumo | `/crm/oportunidadesresumo/` | CRM |
| 23 | Tarefas (CRM) | `/crm/tarefas/` | CRM |
| 24 | Tarefas - Resumo (CRM) | `/crm/tarefasresumo/` | CRM |
| 25 | Soluções (CRM) | `/crm/solucoes/` | CRM |
| 26 | Fases (CRM) | `/crm/fases/` | CRM |
| 27 | Usuários (CRM) | `/crm/usuarios/` | CRM |
| 28 | Status (CRM) | `/crm/status/` | CRM |
| 29 | Motivos (CRM) | `/crm/motivos/` | CRM |
| 30 | Tipos (CRM) | `/crm/tipos/` | CRM |
| 31 | Parceiros (CRM) | `/crm/parceiros/` | CRM |
| 32 | Finders (CRM) | `/crm/finders/` | CRM |
| 33 | Origens (CRM) | `/crm/origens/` | CRM |
| 34 | Concorrentes (CRM) | `/crm/concorrentes/` | CRM |
| 35 | Verticais (CRM) | `/crm/verticais/` | CRM |
| 36 | Vendedores (CRM) | `/crm/vendedores/` | CRM |
| 37 | Telemarketing (CRM) | `/crm/telemarketing/` | CRM |
| 38 | Pré-Vendas (CRM) | `/crm/prevendas/` | CRM |
| 39 | Tipos de Tarefas (CRM) | `/crm/tipotarefa/` | CRM |
| 40 | CC — Lançamentos | `/financas/contacorrentelancamentos/` | Finanças |
| 41 | Contas a Pagar | `/financas/contapagar/` | Finanças |
| 42 | Contas a Receber | `/financas/contareceber/` | Finanças |
| 43 | Boletos | `/financas/boletos/` | Finanças |
| 44 | PIX | `/financas/pix/` | Finanças |
| 45 | Extrato CC | `/financas/extrato/` | Finanças |
| 46 | Orçamento de Caixa | `/financas/orcamento/` | Finanças |
| 47 | Pesquisar Títulos | `/financas/pesquisartitulos/` | Finanças |
| 48 | Movimentos Financeiros | `/financas/movimentos/` | Finanças |
| 49 | Bancos | `/financas/bancos/` | Finanças |
| 50 | Tipos de Documento | `/financas/tiposdocumento/` | Finanças |
| 51 | Tipos de Contas CC | `/financas/tiposcc/` | Finanças |
| 52 | Contas do DRE | `/financas/contasdre/` | Finanças |
| 53 | Finalidade de Transferência | `/financas/finalidadetransferencia/` | Finanças |
| 54 | Origem dos Títulos | `/financas/origentitulos/` | Finanças |
| 55 | Bandeiras de Cartão | `/financas/bandeirascartao/` | Finanças |
| 56 | Produtos — Cadastro | `/geral/produtos/` | Compras/Estoque |
| 57 | Produtos — Características | `/geral/produtoscaract/` | Compras/Estoque |
| 58 | Produtos — Estrutura | `/geral/produtosestrutura/` | Compras/Estoque |
| 59 | Produtos — Kit | `/geral/produtoskit/` | Compras/Estoque |
| 60 | Produtos — Variação | `/produtos/variacao/` | Compras/Estoque |
| 61 | Produtos — Lote | `/produtos/produtoslote/` | Compras/Estoque |
| 62 | Requisições de Compra | `/produtos/requisicaocompra/` | Compras/Estoque |
| 63 | Pedidos de Compra | `/produtos/pedidocompra/` | Compras/Estoque |
| 64 | Ordens de Produção | `/produtos/op/` | Compras/Estoque |
| 65 | Nota de Entrada | `/produtos/notaentrada/` | Compras/Estoque |
| 66 | Nota de Entrada — Faturamento | `/produtos/notaentradafat/` | Compras/Estoque |
| 67 | Recebimento de NF | `/produtos/recebimentonfe/` | Compras/Estoque |
| 68 | Resumo de Compras | `/produtos/compras-resumo/` | Compras/Estoque |
| 69 | Estoque — Ajustes | `/estoque/ajustes/` | Compras/Estoque |
| 70 | Estoque — Consulta | `/estoque/consultar/` | Compras/Estoque |
| 71 | Estoque — Movimentos | `/estoque/movimento/` | Compras/Estoque |
| 72 | Locais de Estoque | `/estoque/locais/` | Compras/Estoque |
| 73 | Resumo do Estoque | `/estoque/resumo/` | Compras/Estoque |
| 74 | Famílias de Produto | `/geral/familias/` | Compras/Estoque |
| 75 | Unidades de Medida | `/geral/unidades/` | Compras/Estoque |
| 76 | Compradores | `/estoque/comprador/` | Compras/Estoque |
| 77 | Produto x Fornecedor | `/estoque/produtofornecedor/` | Compras/Estoque |
| 78 | Formas Pagamento (Compras) | `/produtos/formaspagcompras/` | Compras/Estoque |
| 79 | NCM | `/produtos/ncm/` | Compras/Estoque |
| 80 | Cenário de Impostos | `/produtos/cenarioimpostos/` | Compras/Estoque |
| 81 | CFOP | `/produtos/cfop/` | Compras/Estoque |
| 82 | ICMS — CST | `/produtos/icmscst/` | Compras/Estoque |
| 83 | ICMS — CSOSN | `/produtos/icmscsosn/` | Compras/Estoque |
| 84 | ICMS — Origem | `/produtos/icmsorigem/` | Compras/Estoque |
| 85 | PIS — CST | `/produtos/piscst/` | Compras/Estoque |
| 86 | COFINS — CST | `/produtos/cofinscst/` | Compras/Estoque |
| 87 | IPI — CST | `/produtos/ipicst/` | Compras/Estoque |
| 88 | IPI — Enquadramento | `/produtos/ipienq/` | Compras/Estoque |
| 89 | Tipo de Cálculo | `/produtos/tpcalc/` | Compras/Estoque |
| 90 | CEST | `/produtos/cest/` | Compras/Estoque |
| 91 | Pedidos de Venda — Resumido | `/produtos/pedidovenda/` | Vendas/NF-e |
| 92 | Pedidos de Venda (Completo) | `/produtos/pedido/` | Vendas/NF-e |
| 93 | Pedidos de Venda — Faturamento | `/produtos/pedidovendafat/` | Vendas/NF-e |
| 94 | Pedidos de Venda — Etapas | `/produtos/pedidoetapas/` | Vendas/NF-e |
| 95 | CT-e / CT-e OS | `/produtos/cte/` | Vendas/NF-e |
| 96 | Remessa de Produtos | `/produtos/remessa/` | Vendas/NF-e |
| 97 | Remessa — Faturamento | `/produtos/remessafat/` | Vendas/NF-e |
| 98 | Resumo de Vendas | `/produtos/vendas-resumo/` | Vendas/NF-e |
| 99 | Obter Documentos (NF-e/CTe) | `/produtos/dfedocs/` | Vendas/NF-e |
| 100 | Cupom Fiscal — Adicionar | `/produtos/cupomfiscalincluir/` | Vendas/NF-e |
| 101 | Cupom Fiscal — Cancelar/Excluir | `/produtos/cupomfiscal/` | Vendas/NF-e |
| 102 | Cupom Fiscal — Consultar | `/produtos/cupomfiscalconsultar/` | Vendas/NF-e |
| 103 | Importar NFC-e | `/produtos/nfce/` | Vendas/NF-e |
| 104 | Importar CFe-SAT | `/produtos/sat/` | Vendas/NF-e |
| 105 | NF-e — Consultas | `/produtos/nfconsultar/` | Vendas/NF-e |
| 106 | NF-e — Utilitários | `/produtos/notafiscalutil/` | Vendas/NF-e |
| 107 | NF-e — Importar | `/produtos/nfe/` | Vendas/NF-e |
| 108 | Vendedores (Vendas) | `/produtos/vendedores/` | Vendas/NF-e |
| 109 | Formas Pagamento (Vendas) | `/produtos/formaspagvendas/` | Vendas/NF-e |
| 110 | Tabela de Preços | `/produtos/tabelaprecos/` | Vendas/NF-e |
| 111 | Etapas de Faturamento | `/produtos/etapafat/` | Vendas/NF-e |
| 112 | Meios de Pagamento | `/produtos/meiosdepagamento/` | Vendas/NF-e |
| 113 | Origem do Pedido | `/produtos/origempedido/` | Vendas/NF-e |
| 114 | Motivos de Devolução | `/produtos/motivosdevolucao/` | Vendas/NF-e |
| 115 | Serviços (Cadastro) | `/servicos/servico/` | Serviços/NFS-e |
| 116 | Ordens de Serviço | `/servicos/os/` | Serviços/NFS-e |
| 117 | OS — Faturamento | `/servicos/osp/` | Serviços/NFS-e |
| 118 | OS — Fat. em Lote | `/servicos/oslote/` | Serviços/NFS-e |
| 119 | Contratos de Serviço | `/servicos/contrato/` | Serviços/NFS-e |
| 120 | Contratos — Faturamento | `/servicos/contratofat/` | Serviços/NFS-e |
| 121 | Contratos — Fat. em Lote | `/servicos/contratolote/` | Serviços/NFS-e |
| 122 | Resumo de Serviços | `/servicos/resumo/` | Serviços/NFS-e |
| 123 | Obter Documentos (NFS-e/OS) | `/servicos/osdocs/` | Serviços/NFS-e |
| 124 | NFS-e — Consultas | `/servicos/nfse/` | Serviços/NFS-e |
| 125 | Vendedores (Serviços) | `/servicos/vendedores/` | Serviços/NFS-e |
| 126 | Serviços no Município | `/servicos/listaservico/` | Serviços/NFS-e |
| 127 | Tipos de Tributação | `/servicos/tipotrib/` | Serviços/NFS-e |
| 128 | LC 116 | `/servicos/lc116/` | Serviços/NFS-e |
| 129 | NBS | `/servicos/nbs/` | Serviços/NFS-e |
| 130 | IBPT | `/servicos/ibpt/` | Serviços/NFS-e |
| 131 | Formas Pagamento (Serviços) | `/servicos/formaspagamento/` | Serviços/NFS-e |
| 132 | Tipo Faturamento Contrato | `/servicos/contratotpfat/` | Serviços/NFS-e |
| 133 | Etapas de Faturamento (Serv.) | `/servicos/etapafat/` | Serviços/NFS-e |
| 134 | Tipo de Utilização | `/servicos/tipoutilizacao/` | Serviços/NFS-e |
| 135 | Classificação do Serviço | `/servicos/classificacaoservico/` | Serviços/NFS-e |
| 136 | Documentos Fiscais (XMLs) | `/contador/xml/` | Painel Contador |
| 137 | Resumo Fechamento Contábil | `/contador/resumo/` | Painel Contador |

---

## Fluxos de Integração Mais Comuns

### Fluxo 1 — Venda de Produto com NF-e
```
1. [IncluirCliente]          → /geral/clientes/
2. [IncluirProduto]          → /geral/produtos/
3. [IncluirPedidoVenda]      → /produtos/pedido/         (etapa: "10")
4. [FaturarPedidoVenda]      → /produtos/pedidovendafat/ (emite NF-e)
5. [ConsultarNF]             → /produtos/nfconsultar/    (verifica emissão)
6. [ObterNfe]                → /produtos/dfedocs/        (baixa PDF/XML)
```

### Fluxo 2 — Prestação de Serviço com NFS-e
```
1. [IncluirCliente]          → /geral/clientes/
2. [IncluirCadastroServico]  → /servicos/servico/
3. [IncluirOS]               → /servicos/os/             (etapa: "10")
4. [FaturarOS]               → /servicos/osp/            (emite NFS-e)
5. [ListarNFSEs]             → /servicos/nfse/           (verifica emissão)
6. [ObterNFSe]               → /servicos/osdocs/         (baixa PDF/XML)
```

### Fluxo 3 — Contas a Pagar (Fornecedor)
```
1. [IncluirCliente]          → /geral/clientes/          (tag fornecedor)
2. [IncluirContaPagar]       → /financas/contapagar/
3. [BaixarContaPagar]        → /financas/contapagar/     (registra pagamento)
4. [ListarExtrato]           → /financas/extrato/        (confirma na CC)
```

### Fluxo 4 — Sincronização Incremental de Clientes
```
1. Armazenar última data/hora de sync
2. [ListarClientes]          → filtrar_apenas_alteracao: "S" + datas
3. Para cada cliente: upsert na base local usando codigo_cliente_omie
4. Atualizar última data/hora de sync
```

### Fluxo 5 — Pedido de Compra com Entrada de Estoque
[IncluirCliente]          → /geral/clientes/          (fornecedor)
[IncluirProduto]          → /geral/produtos/
[IncluirPedCompra]        → /produtos/pedidocompra/
[FaturarPedCompra]        → /produtos/pedidocompra/   (gera nota entrada)
[ConsultarEstoque]        → /estoque/consultar/       (verifica saldo)


---

## Campos Obrigatórios por Entidade (Resumo)

| Entidade | Campos Obrigatórios |
|----------|---------------------|
| Cliente/Fornecedor | `razao_social` |
| Cliente (para NF-e) | `razao_social`, `cnpj_cpf`, `nome_fantasia`, `email`, `endereco`, `bairro`, `cidade`, `estado`, `cep`, `optante_simples_nacional`, `contribuinte` |
| Produto | `codigo`, `descricao`, `unidade` |
| Pedido de Venda | `codigo_cliente`, `data_previsao`, `etapa`, itens com `codigo_produto`, `quantidade`, `valor_unitario` |
| Conta a Pagar | `codigo_cliente_fornecedor`, `data_vencimento`, `valor_documento` |
| Conta a Receber | `codigo_cliente_fornecedor`, `data_vencimento`, `valor_documento` |
| Lançamento CC | `n
| Lançamento CC | `nCodCC`, `dDtLanc`, `nValorLanc` |
| Ordem de Serviço | `nCodCli`, `dDtPrevisao`, `cEtapa`, pelo menos 1 serviço com `cDescServ`, `nValUnit` |
| Contrato de Serviço | `nCodCli`, `dVigInicial`, `dVigFinal`, `nDiaFat`, pelo menos 1 serviço |
| Conta Corrente | `tipo_conta_corrente`, `codigo_banco`, `descricao` |

---

## Tabelas de Referência Rápida

### Etapas de Pedido de Venda
| Código | Descrição |
|--------|-----------|
| `10` | Em Aberto |
| `20` | Aprovado |
| `50` | Faturado |
| `60` | Cancelado |

### Etapas de Ordem de Serviço
| Código | Descrição |
|--------|-----------|
| `10` | Em Aberto |
| `20` | Em Andamento |
| `50` | Faturada |
| `60` | Cancelada |

### Tipos de Conta Corrente
| Código | Descrição |
|--------|-----------|
| `CX` | Caixa |
| `CC` | Conta Corrente |
| `PP` | Conta Pagamento (ex: PicPay, Mercado Pago) |
| `AC` | Aplicação/Investimento |
| `PX` | Conta PIX |

### Tipos de Lançamento CC
| Código | Descrição |
|--------|-----------|
| `DIN` | Dinheiro |
| `CHQ` | Cheque |
| `CC` | Cartão de Crédito |
| `CD` | Cartão de Débito |
| `BOL` | Boleto |
| `PIX` | PIX |
| `TED` | TED/DOC |
| `DEP` | Depósito |

### Tipo de Operação da NF-e (`tpNF`)
| Código | Descrição |
|--------|-----------|
| `0` | Entrada |
| `1` | Saída |

### Finalidade da NF-e (`finNFe`)
| Código | Descrição |
|--------|-----------|
| `1` | NF-e Normal |
| `2` | NF-e Complementar |
| `3` | NF-e de Ajuste |
| `4` | NF-e de Devolução |

### Operações de Pedido (`opPedido`)
| Código | Descrição | Módulo |
|--------|-----------|--------|
| `01` | Venda de Serviço | Vendas |
| `11` | Venda de Produto | Vendas |
| `12` | Venda de Produto pelo PDV | Vendas |
| `13` | Devolução de Venda | Vendas |
| `14` | Remessa de Produto | Vendas |
| `16` | Nota Complementar de Saída | Vendas |
| `21` | Compra de Produto | Compras |
| `22` | Compra de Produto (Importação) | Compras |
| `23` | Devolução ao Fornecedor | Compras |
| `24` | Retorno de Remessa | Compras |
| `26` | Nota Complementar de Entrada | Compras |
| `28` | Ordem de Produção | Compras |

### Status de NFS-e (`cStatusNFSe`)
| Código | Descrição |
|--------|-----------|
| `F` | Faturada |
| `C` | Cancelada |
| `N` | Não Faturada |

### Modelos de Documento Fiscal para Painel Contador
| Código | Descrição |
|--------|-----------|
| `55` | NF-e |
| `65` | NFC-e |
| `SAT` | CF-e SAT |
| `SE` | NFS-e |

### Flags Globais (string1)
| Valor | Significado |
|-------|-------------|
| `S` | Sim / Ativo / Verdadeiro |
| `N` | Não / Inativo / Falso |

---

## Estrutura de Categorias Financeiras

As categorias seguem uma estrutura hierárquica com código no formato `N.NN.NN`:
```
1.xx.xx = Receitas
  1.01.xx = Receitas de Serviços
    1.01.01 = Serviços Prestados
    1.01.02 = Consultoria
  1.02.xx = Receitas de Produtos
    1.02.01 = Venda de Mercadorias

2.xx.xx = Despesas
  2.01.xx = Despesas Operacionais
    2.01.01 = Aluguel
  2.04.xx = Despesas com Fornecedores
    2.04.01 = Compra de Materiais
```

Use `ListarCategorias` em `/geral/categorias/` para obter todos os códigos do seu plano.

---

## Notas Importantes para Integração

1. **Ids são imutáveis:** Uma vez gerado `codigo_cliente_omie`, ele nunca muda. Armazene-o.

2. **Código de integração é único:** `codigo_cliente_integracao` não pode ser repetido. Use o ID do seu sistema.

3. **CNPJ/CPF:** pode ser enviado com ou sem formatação (`12.345.678/0001-90` ou `12345678000190`).

4. **Datas:** sempre no formato `dd/mm/aaaa` (ex: `07/04/2026`).

5. **Horas:** sempre no formato `hh:mm:ss` (ex: `14:30:00`).

6. **Decimais:** usar ponto como separador (ex: `99.90`, não `99,90`).

7. **Campos DEPRECATED:** não usar campos marcados como DEPRECATED — eles serão removidos em versões futuras.

8. **Categorias e Contas CC:** obrigatórios em quase todos os lançamentos financeiros. Sempre busque os códigos válidos via API antes de usar.

9. **NF-e e NFS-e:** para emitir documentos fiscais, o cadastro fiscal da empresa e os certificados devem estar configurados no painel Omie antes de qualquer integração via API.

10. **Upsert vs Incluir:** prefira `UpsertCliente` / `UpsertProduto` para integrações bidirecionais — evita duplicatas e simplifica o código.

11. **Lote limitado a 50:** métodos `*PorLote` aceitam no máximo 50 registros por chamada.

12. **PIX e Boleto:** requerem o produto **Omie.CASH** ativado na conta do cliente Omie.

---

## Links de Referência

| Recurso | URL |
|---------|-----|
| Portal do Desenvolvedor | https://developer.omie.com.br |
| Lista de APIs | https://developer.omie.com.br/service-list/ |
| Meus Aplicativos (credenciais) | https://developer.omie.com.br/my-apps/ |
| Central de Ajuda — APIs | https://ajuda.omie.com.br/pt-BR/collections/3045828-apis |
| Sandbox / Teste Online | Disponível em cada endpoint via botão "Teste agora mesmo" |

---

*Documento gerado em 07/04/2026 a partir do Portal do Desenvolvedor Omie.*  
*Total de APIs documentadas: 137+ endpoints*

O documento está completo! Aqui está o resumo do que foi coberto:
O que o Claude Code vai encontrar no .md:

Autenticação — estrutura exata de request com app_key + app_secret
137+ endpoints catalogados com URL, métodos disponíveis e todos os campos
Todos os 7 módulos — Geral, CRM, Finanças, Compras/Estoque, Vendas/NF-e, Serviços/NFS-e, Painel do Contador
Tipos complexos com nomes e tamanhos dos campos (string60, decimal, integer, etc.)
Exemplos JSON de request e response para as APIs mais usadas
Fluxos completos (ex: Venda com NF-e em 6 passos, Serviço com NFS-e, Contas a pagar)
Tabelas de referência — etapas, tipos de conta, modelos fiscais, operações
Tratamento de erros com código pronto em Node.js e Python
Boas práticas — paginação, sincronização incremental, rate limit, campos obrigatórios
