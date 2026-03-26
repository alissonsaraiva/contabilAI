// Transcrição de áudio via Groq Whisper
// Modelo: whisper-large-v3-turbo (rápido, suporta português)

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  groqApiKey: string,
): Promise<string> {
  // Determina extensão a partir do mimetype
  const ext = mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('wav') ? 'wav'
    : 'ogg' // WhatsApp PTT é ogg/opus por padrão

  const formData = new FormData()
  const blob = new Blob([audioBuffer as unknown as BlobPart], { type: mimeType || 'audio/ogg' })
  formData.append('file', blob, `audio.${ext}`)
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('language', 'pt')
  formData.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: formData,
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq Whisper error ${res.status}: ${err.slice(0, 200)}`)
  }

  return (await res.text()).trim()
}
