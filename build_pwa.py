# Builds the installable (PWA) version of Cradle into ./pwa
#   python3 build_pwa.py
# - Removes any built-in starter log (hosted files are public)
# - Bakes in the database address and publishable key from environment variables
#   (CRADLE_SUPABASE_URL, CRADLE_SUPABASE_KEY) or a local .env file, which git ignores
# - Optionally bakes in a donation link (CRADLE_DONATE_URL), shown as "Buy me a coffee"
# - Adds the manifest, icons, and an offline service worker
# - Writes pwa/_headers: security headers, including a Content-Security-Policy that only
#   allows Cradle's own scripts (by hash) and only talks to your Supabase project
# - Publishes the product overview (docs/overview.html and its screenshots) at /overview/
# Deploy the pwa/ folder (Netlify: drag it in, or let netlify.toml run this script).
import json, re, hashlib, base64, shutil, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'cradle.html')).read()
out = os.path.join(here, 'pwa')
os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
for f in ('icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'):
    shutil.copy(os.path.join(here, 'icons', f), os.path.join(out, 'icons', f))

# 1) strip any built-in starter log (personal copies may have one; hosted files must not)
html, n = re.subn(r'<script type="application/json" id="baseData">.*?</script>\n?', '', src, count=1, flags=re.S)
assert n == 1, 'baseData block not found'
assert 'id="baseData"' not in html

# 1b) bake the database address + publishable key, if provided.
#     Real environment variables win (Netlify sets these); otherwise read .env.
def load_env_file(path):
    vals = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals

env = load_env_file(os.path.join(here, '.env'))
url = (os.environ.get('CRADLE_SUPABASE_URL') or env.get('CRADLE_SUPABASE_URL') or '').rstrip('/')
key = os.environ.get('CRADLE_SUPABASE_KEY') or env.get('CRADLE_SUPABASE_KEY') or ''
if key.startswith('sb_secret_') or 'service_role' in key:
    raise SystemExit('CRADLE_SUPABASE_KEY is a SECRET key. Use the publishable key (sb_publishable_...) instead.')
if url or key:
    assert url.startswith('https://') and len(key) > 20, 'set both CRADLE_SUPABASE_URL and CRADLE_SUPABASE_KEY'
    html = html.replace('<script type="application/json" id="cloudConfig">{}</script>',
                        '<script type="application/json" id="cloudConfig">' + json.dumps({'url': url, 'key': key}) + '</script>', 1)
    print('baked database config for', url)
elif os.environ.get('NETLIFY') == 'true' or os.environ.get('CRADLE_REQUIRE_CONFIG') == '1':
    # On a real deploy, never publish a site that asks users for database details.
    # The failed build leaves the last good deploy live.
    raise SystemExit('Missing CRADLE_SUPABASE_URL and CRADLE_SUPABASE_KEY. In Netlify: Site configuration > '
                     'Environment variables, add both, then Deploys > Trigger deploy.')
else:
    print('no CRADLE_SUPABASE_URL / CRADLE_SUPABASE_KEY: each phone enters the database address once at sign-in')

# 1c) optional donation link (a "Buy me a coffee" button in the profile menu and About)
donate = (os.environ.get('CRADLE_DONATE_URL') or env.get('CRADLE_DONATE_URL') or '').strip()
if donate:
    assert re.fullmatch(r'https://[^\s"<>]+', donate), 'CRADLE_DONATE_URL must be an https:// link'
    html = html.replace('<script type="application/json" id="siteConfig">{}</script>',
                        '<script type="application/json" id="siteConfig">' + json.dumps({'donate': donate}).replace('</', '<\\/') + '</script>', 1)
    print('donation link:', donate)

# 2) head tags
head = '''<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#d0683a">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Cradle">
<meta name="description" content="Baby log that works offline and syncs between family phones">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'''
html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', head, 1)
assert 'manifest.webmanifest' in html
open(os.path.join(out, 'index.html'), 'w').write(html)

# 3) manifest
manifest = {
  "name": "Cradle Baby Log", "short_name": "Cradle",
  "description": "Baby log that works offline and syncs between family phones",
  "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
  "background_color": "#f6f1ea", "theme_color": "#d0683a",
  "icons": [
    {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
    {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
    {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}
json.dump(manifest, open(os.path.join(out, 'manifest.webmanifest'), 'w'), indent=2)

# 4) service worker: cache name tied to file contents so updates roll out
ver = hashlib.sha1(html.encode()).hexdigest()[:10]
sw = f"""// Cradle offline helper. Cache version changes whenever index.html changes.
const CACHE='cradle-{ver}';
const FILES=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))}});
self.addEventListener('activate',e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener('fetch',e=>{{
  const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/overview/'))return;
  if(r.mode==='navigate'){{
    // Try the network first so updates arrive; fall back to the saved copy offline
    e.respondWith(fetch(r).then(res=>{{const cp=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));return res}}).catch(()=>caches.match('./index.html')));
    return;
  }}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res}})));
}});
// Feed-due notifications (sent by the cradle-notify function; see docs/notifications.md)
self.addEventListener('push',e=>{{let d={{}};try{{d=e.data?e.data.json():{{}}}}catch(x){{}}
  e.waitUntil(self.registration.showNotification(d.title||'Cradle',{{body:d.body||'',tag:d.tag||'cradle',renotify:true,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',data:{{url:'./'}}}}))}});
self.addEventListener('notificationclick',e=>{{e.notification.close();
  e.waitUntil(self.clients.matchAll({{type:'window',includeUncontrolled:true}}).then(cs=>{{for(const c of cs)if('focus' in c)return c.focus();return self.clients.openWindow('./')}}))}});
"""
open(os.path.join(out, 'sw.js'), 'w').write(sw)

# 4b) the product overview page at /overview/ (a separate page; the service worker leaves it alone)
ov_dir = os.path.join(out, 'overview')
shutil.rmtree(ov_dir, ignore_errors=True)
os.makedirs(os.path.join(ov_dir, 'screenshots'))
ov = open(os.path.join(here, 'docs', 'overview.html'), encoding='utf-8').read()
open(os.path.join(ov_dir, 'index.html'), 'w', encoding='utf-8').write(ov)
for f in sorted(os.listdir(os.path.join(here, 'docs', 'screenshots'))):
    if f.endswith('.webp') and ('screenshots/' + f) in ov:
        shutil.copy(os.path.join(here, 'docs', 'screenshots', f), os.path.join(ov_dir, 'screenshots', f))
ov_hashes = ["'sha256-" + base64.b64encode(hashlib.sha256(m.group('body').encode()).digest()).decode() + "'"
             for m in re.finditer(r'<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>', ov, flags=re.S) if 'src=' not in m.group('attrs')]
ov_csp = '; '.join([
    "default-src 'self'",
    "script-src 'self' " + ' '.join(ov_hashes),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
])

# 5) security headers (Netlify reads pwa/_headers)
#    Only Cradle's own inline scripts may run: each is allowed by its SHA-256 hash, so an
#    injected script can't run even if it got into the page. JSON data blocks don't execute.
hashes = []
for m in re.finditer(r'<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>', html, flags=re.S):
    if 'application/json' in m.group('attrs') or 'src=' in m.group('attrs'):
        continue
    hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group('body').encode()).digest()).decode() + "'")
assert hashes, 'no inline scripts found'
connect = url if url else 'https://*.supabase.co'
csp = '; '.join([
    "default-src 'self'",
    "script-src 'self' " + ' '.join(hashes),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' " + connect,
    "media-src 'self' data: blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
])
# The app's policy goes on the app's own files; the overview page gets its own (it loads Google Fonts).
headers = f'''# Generated by build_pwa.py. Netlify applies these to every response.
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000

/
  Content-Security-Policy: {csp}
  Cache-Control: no-cache

/index.html
  Content-Security-Policy: {csp}
  Cache-Control: no-cache

/sw.js
  Content-Security-Policy: {csp}
  Cache-Control: no-cache

/manifest.webmanifest
  Content-Security-Policy: {csp}

/overview/*
  Content-Security-Policy: {ov_csp}
'''
open(os.path.join(out, '_headers'), 'w').write(headers)
print('wrote security headers (' + str(len(hashes)) + ' script hash' + ('es' if len(hashes) != 1 else '') + ', connect-src ' + connect + ')')
print('built pwa/ with cache', ver)
