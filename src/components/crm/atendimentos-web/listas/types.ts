export type ListaResumo = {
  id: string
  nome: string
  criador: { id: string; nome: string }
  totalMembros: number
  ultimoEnvio: {
    id: string
    criadoEm: string
    status: string
    totalMembros: number
    totalEnviados: number
    totalFalhas: number
  } | null
  criadaEm: string
  atualizadaEm: string
}

export type MembroLista = {
  id: string
  tipo: 'cliente' | 'socio'
  clienteId: string | null
  socioId: string | null
  nome: string
  whatsapp: string | null
  empresa: string | null
}

export type ListaDetalheData = {
  id: string
  nome: string
  criador: { id: string; nome: string }
  totalMembros: number
  criadaEm: string
  atualizadaEm: string
  membros: MembroLista[]
}

export type EnvioResumo = {
  id: string
  conteudo: string
  mediaUrl: string | null
  mediaType: string | null
  mediaFileName: string | null
  status: string
  totalMembros: number
  totalEnviados: number
  totalFalhas: number
  operador: { id: string; nome: string }
  criadoEm: string
  destinatarios: {
    id: string
    clienteId: string | null
    socioId: string | null
    remoteJid: string
    status: string
    erroEnvio: string | null
    enviadoEm: string | null
  }[]
}
