// Service Worker para o Portal do Cliente (PWA)
// Estratégia: Network-first para APIs, Cache-first para assets estáticos

const CACHE_NAME = 'portal-v1'

// Assets estáticos que podem ser cacheados
const STATIC_ASSETS = [
  '/portal/dashboard',
  '/portal/empresa',
  '/portal/documentos',
  '/portal/suporte',
  '/portal/configuracoes',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache offline fallback page
      return cache.addAll(['/portal/dashboard']).catch(() => {})
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Nova notificação', body: event.data.text(), url: '/portal/dashboard' }
  }

  const { title = 'Nova notificação', body = '', url = '/portal/dashboard', icon } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/portal/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já tem uma aba do portal aberta, foca nela
      for (const client of windowClients) {
        if (client.url.includes('/portal') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Senão, abre nova aba
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// ── Fetch (cache strategy) ─────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Não interceptar APIs, autenticação ou chamadas externas
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.origin !== self.location.origin
  ) {
    return
  }

  // Network-first para páginas do portal (sempre dados frescos quando online)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cachear respostas bem-sucedidas de navegação
        if (response.ok && event.request.mode === 'navigate') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline: tentar servir do cache
        return caches.match(event.request).then(
          (cached) => cached || caches.match('/portal/dashboard')
        )
      })
  )
})
