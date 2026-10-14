"""Assemble the PMO Bot page (index.html) and its service worker from the source parts + the generated data.  Pure Python (no browser needed), so the hourly job can run it."""
import os, re, hashlib

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<title>PMO Bot</title>
<meta name="description" content="Weekly project control cards and portfolio dashboard for the NWC Northwestern Cluster PMO.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="PMO Bot">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0E6286">
<script>(function(){var d=document.documentElement;try{if((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true)d.classList.add('standalone');}catch(e){}var t='light';try{t=localStorage.getItem('pmoTheme')==='dark'?'dark':'light';}catch(e){}d.setAttribute('data-theme',t);})();</script>
<style>
"""

SW = """/* PMO Bot service worker - lets the app open offline. Pages are fetched fresh when online, so new weekly data always shows up. */
const CACHE = 'pmo-bot-__BUILD__';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if(req.mode === 'navigate'){                                   // the page: network first, cached copy when offline
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })));   // icons etc.: cache first
});
"""


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def src_hash(src_dir):
    h = hashlib.sha256()
    for name in sorted(os.listdir(src_dir)):
        p = os.path.join(src_dir, name)
        if os.path.isfile(p):
            h.update(name.encode()); h.update(open(p, 'rb').read())
    return h.hexdigest()


def assemble(src_dir, gen_js):
    """-> full index.html text.  gen_js = the generated data (REPORT_DATE, PROJECTS, PORTFOLIO, PORTFOLIOS, GATES, BUILD)."""
    style = read(os.path.join(src_dir, 'style.css'))
    if os.path.exists(os.path.join(src_dir, 'reports.css')):
        style += read(os.path.join(src_dir, 'reports.css'))
    body = (read(os.path.join(src_dir, 'body.html')).replace('__LOGO_NWC__', read(os.path.join(src_dir, 'logo_nwc.txt')).strip())
            .replace('__LOGO_HILL__', read(os.path.join(src_dir, 'logo_hill.txt')).strip()))
    avatar = read(os.path.join(src_dir, 'avatar_js.js'))
    logic = read(os.path.join(src_dir, 'logic.js'))
    reports = read(os.path.join(src_dir, 'reports.js')) if os.path.exists(os.path.join(src_dir, 'reports.js')) else ''
    shell = read(os.path.join(src_dir, 'shell.js'))
    tail = '</script>\n</body>\n</html>'
    assert logic.rstrip().endswith(tail), 'unexpected end of logic.js'
    logic = logic[:logic.rindex('</script>')] + reports + shell + '</script>\n</body>\n</html>\n'
    html = HEAD + style + '</style>\n</head>\n<body>\n' + body + '\n' + avatar + gen_js + logic
    assert not re.search(r'__(LOGO_NWC|LOGO_HILL|DATA|PORTFOLIO|AVATAR)__', html), 'unreplaced placeholder'
    return html


def service_worker(html):
    return SW.replace('__BUILD__', hashlib.sha256(html.encode('utf-8')).hexdigest()[:10])


def write_site(src_dir, gen_js, out_dir):
    html = assemble(src_dir, gen_js)
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    with open(os.path.join(out_dir, 'sw.js'), 'w', encoding='utf-8') as f:
        f.write(service_worker(html))
    return html
