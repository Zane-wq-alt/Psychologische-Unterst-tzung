const CACHE = "opora-v24";
const FILES = ["./","./index.html","./manifest.webmanifest","./src/ui/legacy.css","./src/core/errors.js","./src/core/storage.js","./src/storage/cloud-sync.js","./src/storage/supabase-transport.js","./src/storage/e2e-crypto.js","./src/storage/e2e-transport.js","./src/storage/merge.js","./src/storage/supabase-config.js","./src/storage/supabase-auth.js","./src/storage/cloud-controller.js","./src/features/privacy.js","./src/features/selective-delete.js","./src/legacy/00-assets-and-helpers.js","./src/legacy/10-state.js","./src/ui/20-navigation.js","./src/core/30-reference-data.js","./src/features/40-predictions.js","./src/features/50-views.js","./src/features/60-weekly.js","./src/features/70-actions.js","./src/features/80-audio.js","./src/features/90-breathing.js","./src/features/95-games-and-startup.js","./assets/stickers/whar.webp","./assets/stickers/cool.webp","./assets/stickers/smooch.webp","./assets/stickers/sometimes.webp","./assets/stickers/a2a.webp","./assets/stickers/meds.webp","./assets/stickers/lying.webp","./assets/stickers/cooking.webp","./assets/stickers/overwhelmed.webp","./assets/stickers/draw.webp","./assets/stickers/reading.webp","./assets/stickers/hungrysmol.webp","./assets/stickers/quiet.webp","./assets/stickers/hungry.webp","./assets/stickers/videos.webp","./assets/stickers/rose.webp","./assets/stickers/wherego.webp","./assets/stickers/helpme.webp","./assets/stickers/flat.webp","./assets/stickers/likethat.webp","./assets/stickers/headbutt.webp","./assets/stickers/muchworld.webp","./assets/stickers/give.webp","./assets/stickers/likeyou.webp","./assets/stickers/bye.webp","./assets/stickers/yes.webp","./assets/stickers/grin.webp","./assets/stickers/goodmorning.webp","./assets/stickers/hearts.webp","./assets/stickers/proud.webp","./assets/stickers/bath.webp","./assets/stickers/ok.webp","./assets/stickers/huglying.webp","./assets/stickers/snug.webp","./assets/stickers/noenergy.webp","./assets/stickers/snack.webp","./assets/stickers/study.webp","./assets/stickers/sad.webp","./assets/stickers/sniff.webp","./assets/stickers/goodnight.webp","./assets/stickers/hug.webp","./assets/stickers/drink.webp","./assets/stickers/juice.webp","./assets/stickers/frustrated.webp","./assets/stickers/idk.webp","./assets/stickers/eyes.webp","./assets/stickers/dontsay.webp","./assets/stickers/no.webp","./assets/stickers/lovethat.webp","./assets/stickers/daydream.webp","./assets/stickers/oh.webp","./assets/stickers/thanks.webp","./assets/stickers/cry.webp","./assets/stickers/home.webp","./assets/stickers/apple.webp","./assets/stickers/boundary.webp","./icon-192.png","./icon-512.png","./icon-maskable.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); });
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("opora-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    const fresh = fetch(event.request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => {
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    });
    return cached || fresh;
  }));
});