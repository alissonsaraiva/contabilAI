import { describe, it, expect } from 'vitest'
import { detectMediaType, extractMediaCaption, extractMimeType } from '@/lib/whatsapp/media'

// ─── detectMediaType ───────────────────────────────────────────────────────────

describe('detectMediaType', () => {
  it('detecta audio', () => {
    expect(detectMediaType({ audioMessage: {} })).toBe('audio')
  })

  it('detecta ptt (push-to-talk)', () => {
    expect(detectMediaType({ pttMessage: {} })).toBe('audio')
  })

  it('detecta imagem', () => {
    expect(detectMediaType({ imageMessage: {} })).toBe('image')
  })

  it('detecta documento', () => {
    expect(detectMediaType({ documentMessage: {} })).toBe('document')
  })

  it('detecta documento com caption', () => {
    expect(detectMediaType({ documentWithCaptionMessage: {} })).toBe('document')
  })

  it('detecta sticker', () => {
    expect(detectMediaType({ stickerMessage: {} })).toBe('sticker')
  })

  it('retorna null para mensagem de texto puro', () => {
    expect(detectMediaType({ conversation: 'Olá' })).toBeNull()
  })
})

// ─── extractMediaCaption ───────────────────────────────────────────────────────

describe('extractMediaCaption', () => {
  it('extrai caption de imagem', () => {
    expect(extractMediaCaption({ imageMessage: { caption: 'Foto do documento' } })).toBe('Foto do documento')
  })

  it('extrai caption de documento', () => {
    expect(extractMediaCaption({ documentMessage: { caption: 'Relatório' } })).toBe('Relatório')
  })

  it('retorna string vazia quando não há caption', () => {
    expect(extractMediaCaption({ imageMessage: {} })).toBe('')
  })

  it('retorna string vazia para mensagem sem mídia', () => {
    expect(extractMediaCaption({ conversation: 'Oi' })).toBe('')
  })
})

// ─── extractMimeType ───────────────────────────────────────────────────────────

describe('extractMimeType', () => {
  it('extrai mimetype de áudio', () => {
    expect(extractMimeType({ audioMessage: { mimetype: 'audio/ogg' } })).toBe('audio/ogg')
  })

  it('extrai mimetype de imagem', () => {
    expect(extractMimeType({ imageMessage: { mimetype: 'image/jpeg' } })).toBe('image/jpeg')
  })

  it('retorna application/octet-stream como fallback', () => {
    expect(extractMimeType({ conversation: 'Oi' })).toBe('application/octet-stream')
  })
})
