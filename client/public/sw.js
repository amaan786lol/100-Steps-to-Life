const CACHE_NAME = "hundred-steps-life-shell-v3";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/manus-storage/100-steps-to-life-app-icon_4d2942a9.svg",
  "/manus-storage/100-steps-to-life-app-icon-192_7e3a77c1.png",
  "/manus-storage/100-steps-to-life-app-icon-512_49a17a10.png"
];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  const page = await fetch("/", { cache: "no-cache" });
  await cache.put("/", page.clone());
  const html = await page.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"?#]+(?:\?[^"#]*)?)"/g)]
    .map((match) => new URL(match[1], self.location.origin).pathname + new URL(match[1], self.location.origin).search)
    .filter((path) => path.startsWith("/assets/") || path.startsWith("/src/"));
  await Promise.all(assetUrls.map((assetUrl) => cache.add(assetUrl).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
