/**
 * Constantes do webhook WhatsApp — Evolution API.
 * Centralizadas aqui para evitar magic numbers espalhados no código.
 */

/** Intervalo mínimo entre respostas ao mesmo número (ms). */
export const RATE_LIMIT_MS = 3000

/**
 * Tamanho máximo de mensagem antes de enviar para a IA.
 * 4000 chars ≈ ~3 páginas de texto — mensagens legítimas raramente excedem isso.
 */
export const MAX_MSG_LENGTH = 4000

/**
 * TTL do cache de identificação de contato (phone → contexto resolvido).
 * 5min: janela curta para capturar conversões lead→cliente sem cache stale.
 */
export const PHONE_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Padrões de jailbreak/prompt injection — inglês e português BR.
 * Normalização: o texto já passa por trim/sanitize antes de ser testado aqui.
 */
export const JAILBREAK_PATTERNS: RegExp[] = [
  // Inglês
  /ignore\s+(previous|all|above|prior)\s+instructions?/i,
  /forget\s+(everything|all|your)\s+(you|instructions?|rules?)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|another|unrestricted)/i,
  /act\s+as\s+(if\s+you\s+are\s+)?(a\s+)?(different|unrestricted|evil|jailbreak)/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /bypass\s+(your\s+)?(filter|restriction|rule|guideline)/i,
  /pretend\s+(you\s+have\s+no|you\s+are\s+not|there\s+are\s+no)/i,
  /\bDAN\b/,                          // "Do Anything Now" jailbreak
  /\[SYSTEM\]/i,                      // tentativa de injetar bloco SYSTEM
  /\[INST\]/i,                        // Llama instruction format injection
  /<\|im_start\|>/i,                  // ChatML injection
  /\{\{.*\}\}/,                       // template injection
  // Português BR
  /ignore\s+(as\s+)?instru[çc][õo]es\s+anteriores/i,
  /esque[çc]a?\s+(tudo|todas?\s+as\s+instru[çc][õo]es)/i,
  /voc[êe]\s+(agora\s+[eé]|[eé]\s+agora)\s+(um|uma)\s+/i,
  /finja\s+(que\s+)?(voc[êe]\s+[eé]|n[aã]o\s+tem|n[aã]o\s+[eé])/i,
  /modo\s+(desenvolvedor|sem\s+restri[çc][õo]es?|irrestrito)/i,
  /sem\s+restri[çc][õo]es?\s+/i,
  /novo\s+(assistente|modo|sistema|prompt)/i,
  /ignore\s+o\s+(sistema|prompt|instru[çc][aã]o)/i,
]
