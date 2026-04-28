// sw.js — My Gourmet Archive 서비스워커
const CACHE = 'mga-v1'

self.addEventListener('install', e => {
  // 캐시 프리로드 없이 바로 활성화
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Firebase / Firestore → 네트워크 우선
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('firestore') ||
      url.hostname.includes('gstatic')) {
    return e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
  }

  // 지도 타일 → 캐시 우선
  if (url.hostname.includes('tile.openstreetmap')) {
    return e.respondWith(
      caches.open('map-tiles').then(c =>
        c.match(e.request).then(r => r ?? fetch(e.request).then(res => {
          c.put(e.request, res.clone())
          return res
        }))
      )
    )
  }

  // 나머지 → 네트워크 우선, 실패시 캐시
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})
