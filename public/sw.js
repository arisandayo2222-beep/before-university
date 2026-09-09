const CACHE_NAME = "before-university-shell-v4"

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME)
  const response = await fetch("/", { cache: "reload" })
  if (!response.ok) throw new Error("App shell unavailable")
  const html = await response.clone().text()
  await cache.put("/", response)
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname !== "/sw.js")
    .map((url) => `${url.pathname}${url.search}`)
  await Promise.all([...new Set(assetPaths)].map(async (path) => {
    try { await cache.add(path) } catch { /* One optional asset must not block offline setup. */ }
  }))
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell()
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/sw.js") return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone()))
          return response
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error())),
    )
    return
  }

  if (!["script", "style", "font", "image", "manifest"].includes(request.destination)) return
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    })),
  )
})
