// Keeps the app's own files so it opens quickly and can be installed. It never touches anything on another address,
// so nothing from your account (records, photos, sign-in) is ever stored here.
// The build fills in the version, so a new release always replaces the old files.
const CACHE = 'pt-shell-9d72230951';
const SHELL = ['/', '/runtime.js', '/standalone.css', '/config.js', '/vendor/supabase.js', '/fonts/fonts.css', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('pt-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // the page itself: always try the network first, so an update shows up right away
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return r; }).catch(() => caches.match('/')));
    return;
  }
  // everything else: use what we have, and refresh it in the background
  e.respondWith(caches.match(req).then(hit => {
    const fresh = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || fresh;
  }));
});
