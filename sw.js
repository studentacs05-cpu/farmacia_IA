const CACHE='farmacia-heimar-v2-4-1-ui';
const ASSETS=['./','./index.html','./styles.css','./config.js','./manifest.webmanifest','./js/app.js','./js/db.js','./js/analytics.js','./js/product-icons.js','./js/excel.js','./assets/heimar-logo.png','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('farmacia-ai-')||k.startsWith('farmacia-heimar-'))&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Nunca almacenar sesiones, consultas ni datos de Supabase; solo archivos propios.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>caches.match(event.request)));
});
