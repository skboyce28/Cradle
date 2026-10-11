// @ts-nocheck  (plain JavaScript, so Deno skips type checks)
// Cradle: cradle-notify Edge Function
// Sends "feed due" notifications to phones that turned them on. Runs every minute
// (see docs/notifications.md), and does nothing when no feed is due.
//
// - Uses the project's own service key, which Supabase gives every Edge Function
//   automatically. You never copy a key into this file.
// - Creates the notification (VAPID) keys itself the first time it runs and stores them
//   in the database (cradle_push_keys).
// - Standard Web Push: VAPID (RFC 8292) and aes128gcm encryption (RFC 8291), using only
//   the built-in Web Crypto API, so there's nothing to install.
//
// Written as plain JavaScript (valid TypeScript), so the same file runs in Deno on Supabase
// and in Node for Cradle's tests.

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// RFC 8291: encrypt one push message for a subscription (p256dh and auth from the browser).
// opts.salt and opts.localKeys exist only so tests can check against the RFC's example.
export async function encryptPush(payload, p256dh, authSecret, opts = {}) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  const local = opts.localKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = typeof payload === 'string' ? enc.encode(payload) : payload;
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(data, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// RFC 8292: the VAPID header that proves the message comes from this Cradle
export async function vapidHeader(endpoint, keys, contact, now = Date.now()) {
  const priv = await crypto.subtle.importKey('jwk', keys.private_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: contact })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.public_key}`;
}

export async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { public_key: b64u(pub), private_jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

export async function sendOne(n, keys, contact, fetchImpl = fetch) {
  const body = await encryptPush(JSON.stringify({ title: n.title, body: n.body, tag: n.tag }), n.p256dh, n.auth);
  const res = await fetchImpl(n.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(n.endpoint, keys, contact),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: '3600', Urgency: 'high', Topic: 'cradlefeed',
    },
    body,
  });
  return res.status;
}

// One round: make sure keys exist, find who is due, send, and report back
export async function run({ rpc, fetchImpl = fetch, contact = 'https://github.com/skboyce28/Cradle' }) {
  let keys = await rpc('cradle_push_get_keys', {});
  if (!keys || !keys.public_key) keys = await rpc('cradle_push_set_keys', (({ public_key, private_jwk }) => ({ p_public: public_key, p_private: private_jwk }))(await newVapidKeys()));
  const due = (await rpc('cradle_push_due', {})) || [];
  let sent = 0, failed = 0;
  for (const n of due) {
    let status = 0;
    try { status = await sendOne(n, keys, contact, fetchImpl); } catch (_e) { status = 0; }
    if (status >= 200 && status < 300) sent++; else failed++;
    await rpc('cradle_push_result', { p_endpoint: n.endpoint, p_status: status });
  }
  return { sent, failed, keys_ready: !!keys.public_key };
}

// Supabase entry point
if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(async () => {
    const url = Deno.env.get('SUPABASE_URL');
    // Newer projects have SUPABASE_SECRET_KEYS (a JSON list of secret keys); older ones have
    // SUPABASE_SERVICE_ROLE_KEY. Both are provided by Supabase automatically.
    let key = '';
    try { const all = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); key = all.default || Object.values(all)[0] || ''; } catch (_e) { key = ''; }
    key = key || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !key) return new Response(JSON.stringify({ error: 'missing SUPABASE_URL or service key' }), { status: 500 });
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key; // legacy service_role JWT
    const rpc = async (fn, args) => {
      const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      if (!r.ok) throw new Error(fn + ' failed: ' + r.status + ' ' + (await r.text()));
      const t = await r.text(); return t ? JSON.parse(t) : null;
    };
    try {
      const out = await run({ rpc, contact: Deno.env.get('CRADLE_PUSH_CONTACT') || undefined });
      return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });
}
