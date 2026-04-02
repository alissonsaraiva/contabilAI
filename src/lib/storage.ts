import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const storage = new S3Client({
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
  // MinIO local precisa de forcePathStyle; R2 não precisa mas suporta
  forcePathStyle: true,
})

export async function uploadArquivo(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const MAX_SIZE = 100 * 1024 * 1024 // 100 MB
  if (body.length > MAX_SIZE) {
    throw new Error(`Arquivo muito grande: ${body.length} bytes (máximo ${MAX_SIZE})`)
  }
  const BLOCKED_TYPES = ['application/x-msdownload', 'application/x-executable', 'application/x-sh']
  if (BLOCKED_TYPES.includes(contentType)) {
    throw new Error(`Tipo de arquivo não permitido: ${contentType}`)
  }

  const upload = storage.send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[storage] upload timeout após 15s — key: ${key}`)), 15_000),
  )
  await Promise.race([upload, timeout])
  return `${process.env.STORAGE_PUBLIC_URL}/${key}`
}

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(storage, command, { expiresIn: 300 })
}

export async function getDownloadUrl(key: string, expiresIn = 300): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.STORAGE_BUCKET_NAME,
    Key: key,
  })
  return getSignedUrl(storage, command, { expiresIn })
}

export async function deletarArquivo(key: string): Promise<void> {
  await storage.send(
    new DeleteObjectCommand({
      Bucket: process.env.STORAGE_BUCKET_NAME,
      Key: key,
    }),
  )
}

export const storageKeys = {
  documentoLead:    (leadId: string, nome: string)    => `leads/${leadId}/docs/${nome}`,
  documentoCliente: (clienteId: string, nome: string) => `clientes/${clienteId}/docs/${nome}`,
  documentoEmpresa: (empresaId: string, nome: string) => `empresas/${empresaId}/docs/${nome}`,
  contratoLead:     (leadId: string)                  => `contratos/${leadId}/contrato.pdf`,
  logoEscritorio:    ()                                => `escritorio/logo`,
  faviconEscritorio: ()                                => `escritorio/favicon`,
  comunicadoAnexo:   (comunicadoId: string, nome: string) => `comunicados/${comunicadoId}/${nome}`,
  // Cópias locais de NFS-e (PDF e XML) — independentes da disponibilidade da Spedy
  notaFiscalPdf: (clienteId: string, notaId: string) => `notas-fiscais/${clienteId}/${notaId}/nota.pdf`,
  notaFiscalXml: (clienteId: string, notaId: string) => `notas-fiscais/${clienteId}/${notaId}/nota.xml`,
}
