var C="opora-v10",F=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(F)}).then(function(){return self.skipWaiting()}))});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==C}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener("fetch",function(e){if(e.request.method!=="GET")return;var u=new URL(e.request.url);
 if(u.origin!==location.origin){e.respondWith(fetch(e.request).catch(function(){return new Response("",{status:204})}));return}
 e.respondWith(caches.match(e.request).then(function(r){var n=fetch(e.request).then(function(x){if(x&&x.ok){var y=x.clone();caches.open(C).then(function(c){c.put(e.request,y)})}return x}).catch(function(){return r||caches.match("./index.html")});return r||n}))});
