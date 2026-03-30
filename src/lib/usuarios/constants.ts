import type { TipoUsuario } from '@prisma/client'

export const TIPOS: { value: TipoUsuario; label: string }[] = [
  { value: 'assistente', label: 'Assistente' },
  { value: 'contador', label: 'Contador' },
  { value: 'admin', label: 'Admin' },
]
