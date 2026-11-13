const CACHE='school-reports-shell-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/icon.svg','/manifest.webmanifest'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('school-reports-shell')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/signin')||u.pathname.startsWith('/signout')||u.pathname.startsWith('/callback'))return;
 if(r.mode==='navigate'){event.respondWith(fetch(r).then(response=>{if(response.ok)caches.open(CACHE).then(c=>c.put('/',response.clone()));return response;}).catch(()=>caches.match('/')));return;}
 if(/\.(js|css|woff2|svg)$/.test(u.pathname))event.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(response=>{if(response.ok)caches.open(CACHE).then(c=>c.put(r,response.clone()));return response;})));
});
