// sw.js — My Gourmet Archive 서비스워커
const CACHE = 'mga-v1'

const PRECACHE = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/components.css',
  '/css/screens.css',
  '/js/tags.js',
  '/js/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  )
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

  // Firebase / Firestore → 항상 네트워크 우선
  if (url.hostname.includes('firebase') || url.hostname.includes('firestore')) {
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

  // 나머지 → 캐시 우선 (네트워크 폴백)
  e.respondWith(
    caches.match(e.request).then(r => r ?? fetch(e.request))
  )
})
