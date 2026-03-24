import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
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
  await storage.send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
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

export async function deletarArquivo(key: string): Promise<void> {
  await storage.send(
    new DeleteObjectCommand({
      Bucket: process.env.STORAGE_BUCKET_NAME,
      Key: key,
    }),
  )
}

export const storageKeys = {
  documentoLead: (leadId: string, tipo: string) => `leads/${leadId}/${tipo}`,
  documentoCliente: (clienteId: string, tipo: string) => `clientes/${clienteId}/${tipo}`,
  contratoLead: (leadId: string) => `contratos/${leadId}/contrato.pdf`,
  logoEscritorio: () => `escritorio/logo`,
  faviconEscritorio: () => `escritorio/favicon`,
}
