export type ConversaWebItem = {
  id: string
  canal: string
  pausadaEm: string | null
  ultimaMensagemEm: string | null
  atualizadaEm: string
  remoteJid: string | null
  socioId: string | null
  cliente: { id: string; nome: string } | null
  lead: { id: string; contatoEntrada: string; dadosJson: unknown } | null
  mensagens: { conteudo: string; role: string }[]
}

export type EscalacaoWebItem = {
  id: string
  canal: string
  ultimaMensagem: string
  motivoIA: string | null
  criadoEm: string
  status: string
}

export type SelectedConversation =
  | { type: 'whatsapp'; apiPath: string; nome: string; clienteId?: string; leadId?: string }
  | { type: 'portal';   conversaId: string; nome: string; clienteId?: string }

export type FilterTab = 'todas' | 'urgentes' | 'voce' | 'ia'

export type SelectAction =
  | { canal: 'whatsapp'; apiPath: string; nome: string }
  | { canal: 'portal'; clienteId: string; nome: string }

export type Contato = {
  id: string
  nome: string
  whatsapp: string | null
  telefone: string | null
  tipo: 'cliente' | 'socio'
  subtitulo: string
}
