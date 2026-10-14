// @ts-nocheck  (plain JavaScript, so Deno skips type checks)
// Cradle: cradle-owlet Edge Function (optional; see docs/owlet.md)
// Connects a family's Owlet Dream Sock and turns its sleep state into sleep entries on the log.
//
//   POST {action:"connect", household, email, password, region, dsn?, tz}  from the app, signed in
//        Signs in to Owlet once, keeps only Owlet's sign-in token (encrypted), and never the password.
//   POST {} (or {action:"poll"})  every minute from 8-owlet-schedule.sql
//        Checks each connected sock and records asleep or awake (cradle_owlet_record does the rest).
//
// - Needs one secret: CRADLE_OWLET_KEY, 32 random bytes in base64 (Edge Functions, then Secrets).
//   Tokens are encrypted with it (AES-GCM), so the database alone can't use them.
// - Only the sock's sleep state, charging, and battery are read. Heart rate and oxygen are never
//   stored or returned.
// - Owlet has no public API. These are the calls Owlet's own app makes, as documented by the
//   open-source pyowletapi library (MIT). If Owlet changes them, this stops working until updated.
// - Plain JavaScript (valid TypeScript), so the same file runs in Deno on Supabase and in Node for
//   Cradle's tests.

export const REGIONS = {
  world: {
    mini: 'https://ayla-sso.owletdata.com/mini/',
    signin: 'https://user-field-1a2039d9.aylanetworks.com/api/v1/token_sign_in',
    base: 'https://ads-field-1a2039d9.aylanetworks.com/apiv1',
    apiKey: 'AIzaSyCsDZ8kWxQuLJAMVnmEhEkayH1TSxKXfGA',
    appId: 'sso-prod-3g-id', appSecret: 'sso-prod-UEjtnPCtFfjdwIwxqnC0OipxRFU',
  },
  europe: {
    mini: 'https://ayla-sso.eu.owletdata.com/mini/',
    signin: 'https://user-field-eu-1a2039d9.aylanetworks.com/api/v1/token_sign_in',
    base: 'https://ads-field-eu-1a2039d9.aylanetworks.com/apiv1',
    apiKey: 'AIzaSyDm6EhV70wudwN3iOSq3vTjtsdGjdFLuuM',
    appId: 'OwletCare-Android-EU-fw-id', appSecret: 'OwletCare-Android-EU-JKupMPBoj_Npce_9a95Pc8Qo0Mw',
  },
};
export const GOOGLE = { signin: 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword', refresh: 'https://securetoken.googleapis.com/v1/token' };
const ANDROID = { 'X-Android-Package': 'com.owletcare.owletcare', 'X-Android-Cert': '2A3BC26DB0B8B0792DBE28E6FFDC2598F9B12B74' };

export class OwletError extends Error { constructor(msg, reconnect = false) { super(msg); this.reconnect = reconnect; } }

// ---- Owlet's API ----
export function owlet(region, { fetchImpl = fetch, google = GOOGLE, regions = REGIONS } = {}) {
  const R = regions[region];
  if (!R) throw new OwletError('Unknown region');
  const json = async (res) => { const t = await res.text(); try { return t ? JSON.parse(t) : {}; } catch (_e) { return {}; } };
  return {
    // email and password: Owlet's long-lived sign-in (refresh) token
    async login(email, password) {
      const res = await fetchImpl(`${google.signin}?key=${R.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...ANDROID },
        body: new URLSearchParams({ email, password, returnSecureToken: 'true' }).toString() });
      const j = await json(res);
      if (res.status === 200 && j.refreshToken) return j.refreshToken;
      const m = String(j.error && j.error.message || '');
      if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(m)) throw new OwletError('That Owlet email or password isn’t right.');
      if (/TOO_MANY_ATTEMPTS/.test(m)) throw new OwletError('Owlet says too many tries. Wait a while and try again.');
      throw new OwletError('Couldn’t sign in to Owlet (' + res.status + ').');
    },
    // refresh token: a fresh refresh token and an Ayla API token (about a day)
    async access(refresh) {
      const res = await fetchImpl(`${google.refresh}?key=${R.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...ANDROID },
        body: new URLSearchParams({ grantType: 'refresh_token', refreshToken: refresh }).toString() });
      const j = await json(res);
      if (res.status === 400) throw new OwletError('Owlet signed Cradle out. Connect the sock again in Settings.', true);
      if (res.status !== 200 || !j.id_token) throw new OwletError('Owlet sign-in refresh failed (' + res.status + ').');
      const mres = await fetchImpl(R.mini, { headers: { Authorization: j.id_token } });
      const mj = await json(mres);
      if (mres.status !== 200 || !mj.mini_token) throw new OwletError('Owlet sign-in failed at the mini token step (' + mres.status + ').');
      const sres = await fetchImpl(R.signin, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: R.appId, app_secret: R.appSecret, provider: 'owl_id', token: mj.mini_token }) });
      const sj = await json(sres);
      if (sres.status !== 200 || !sj.access_token) throw new OwletError('Owlet sign-in failed at the last step (' + sres.status + ').');
      return { refresh: j.refresh_token || refresh, access: sj.access_token, exp: Date.now() + (Number(sj.expires_in) || 3600) * 1000 - 60e3 };
    },
    async devices(access) {
      const res = await fetchImpl(R.base + '/devices.json', { headers: { Authorization: 'auth_token ' + access } });
      if (res.status === 401) throw new OwletError('expired');
      if (res.status !== 200) throw new OwletError('Couldn’t list Owlet devices (' + res.status + ').');
      return ((await json(res)) || []).map((d) => d.device || d).filter((d) => d && d.dsn);
    },
    // all of a device's properties, after waking the base station's reporting (APP_ACTIVE), like the app does
    async properties(access, dsn) {
      const h = { Authorization: 'auth_token ' + access, 'Content-Type': 'application/json' };
      const a = await fetchImpl(`${R.base}/dsns/${encodeURIComponent(dsn)}/properties/APP_ACTIVE/datapoints.json`, { method: 'POST', headers: h, body: JSON.stringify({ datapoint: { metadata: {}, value: 1 } }) });
      if (a.status === 401) throw new OwletError('expired');
      const res = await fetchImpl(`${R.base}/dsns/${encodeURIComponent(dsn)}/properties.json`, { headers: h });
      if (res.status === 401) throw new OwletError('expired');
      if (res.status !== 200) throw new OwletError('Couldn’t read the sock (' + res.status + ').');
      const out = {};
      for (const p of (await json(res)) || []) { const q = p.property || p; if (q && q.name) out[q.name] = q; }
      return out;
    },
  };
}

// The sock's state from its properties. Sock 3: REAL_TIME_VITALS holds ss (sleep state: 1 awake,
// 8 light sleep, 15 deep sleep, as the Home Assistant integration reads it), chg (charging), and bat.
// Only these are read; hr and ox are ignored on purpose.
export function readState(props, now = Date.now()) {
  const rtv = props && props.REAL_TIME_VITALS;
  if (!rtv) return { state: props && props.CHARGE_STATUS ? 'unsupported' : 'unknown', battery: null };
  let v = {};
  try { v = typeof rtv.value === 'string' ? JSON.parse(rtv.value) : (rtv.value || {}); } catch (_e) { v = {}; }
  const battery = Number.isFinite(+v.bat) ? Math.round(+v.bat) : null;
  const at = Date.parse(rtv.data_updated_at || '');
  if (+v.chg > 0) return { state: 'charging', battery };
  if (props.SOCK_OFF && +props.SOCK_OFF.value === 1) return { state: 'off', battery };
  if (Number.isFinite(at) && now - at > 10 * 60e3) return { state: 'off', battery };
  const ss = +v.ss;
  if (ss === 8 || ss === 15) return { state: 'asleep', battery };
  if (ss === 1) return { state: 'awake', battery };
  return { state: 'unknown', battery };
}

// ---- encryption: AES-GCM, bound to the family (so a token can't be moved to another family's row)
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function keyFrom(secret) {
  let raw;
  try { raw = unb64(String(secret || '').trim()); } catch (_e) { raw = new Uint8Array(); }
  if (raw.length !== 32) throw new OwletError('CRADLE_OWLET_KEY must be 32 random bytes in base64. See docs/owlet.md.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(key, text, household) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(household) }, key, enc.encode(text)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return 'v1:' + b64(out);
}
export async function open(key, sealed, household) {
  if (!sealed || !sealed.startsWith('v1:')) throw new OwletError('Stored token unreadable', true);
  const all = unb64(sealed.slice(3));
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: enc.encode(household) }, key, all.slice(12)));
  } catch (_e) { throw new OwletError('Stored token can’t be decrypted (was CRADLE_OWLET_KEY changed?). Connect the sock again.', true); }
}
const mask = (email) => { const [u, d] = String(email).split('@'); return d ? (u.slice(0, 1) + '•••@' + d) : '•••'; };

// ---- one check of one family's sock
export async function pollOne(row, { key, rpc, api }) {
  const h = row.household_id;
  try {
    const O = api(row.region);
    let access = row.enc_access && row.access_exp && Date.parse(row.access_exp) > Date.now() + 60e3 ? await open(key, row.enc_access, h) : null;
    const renew = async () => {
      const t = await O.access(await open(key, row.enc_refresh, h));
      await rpc('cradle_owlet_tokens', { p_h: h, p_enc_refresh: await seal(key, t.refresh, h), p_enc_access: await seal(key, t.access, h), p_access_exp: new Date(t.exp).toISOString() });
      return t.access;
    };
    if (!access) access = await renew();
    let props;
    try { props = await O.properties(access, row.dsn); }
    catch (e) { if (e.message !== 'expired') throw e; access = await renew(); props = await O.properties(access, row.dsn); }
    const s = readState(props);
    const r = await rpc('cradle_owlet_record', { p_h: h, p_state: s.state, p_battery: s.battery });
    return { household: h, state: s.state, action: r && r.action };
  } catch (e) {
    const msg = e instanceof OwletError ? e.message : 'Couldn’t reach Owlet: ' + String(e && e.message || e);
    await rpc('cradle_owlet_fail', { p_h: h, p_error: msg, p_reconnect: !!(e && e.reconnect) });
    return { household: h, error: msg };
  }
}

export async function pollAll({ key, rpc, api }) {
  const due = (await rpc('cradle_owlet_due', {})) || [];
  const out = [];
  for (const row of due) out.push(await pollOne(row, { key, rpc, api }));
  return { checked: out.length, results: out.map((r) => ({ state: r.state, action: r.action, error: r.error })) };
}

// ---- connect: from the app, with the person's own sign-in
export async function connect(body, { key, rpc, rpcUser, api }) {
  const h = String(body.household || ''), region = body.region === 'europe' ? 'europe' : 'world';
  const email = String(body.email || '').trim(), password = String(body.password || '');
  if (!/^[0-9a-f-]{36}$/i.test(h)) throw new OwletError('No family selected.');
  if (!email || !password) throw new OwletError('Enter your Owlet email and password.');
  const who = await rpcUser('cradle_owlet_check', { p_h: h });
  const O = api(region);
  const refresh = await O.login(email, password);
  const t = await O.access(refresh);
  const devs = await O.devices(t.access);
  const socks = [];
  for (const d of devs) {
    let p = {};
    try { p = await O.properties(t.access, d.dsn); } catch (_e) { p = {}; }
    if (p.REAL_TIME_VITALS || p.CHARGE_STATUS) socks.push({ dsn: d.dsn, name: d.product_name || 'Owlet Sock', v: p.REAL_TIME_VITALS ? 3 : 2 });
  }
  if (!socks.length) throw new OwletError('No Owlet Sock found on that account.');
  let pick = socks.length === 1 ? socks[0] : socks.find((s) => s.dsn === body.dsn);
  if (!pick) return { choose: socks.map((s) => ({ dsn: s.dsn, name: s.name, last4: s.dsn.slice(-4) })) };
  await rpc('cradle_owlet_save', {
    p_h: h, p_user: who.user, p_hint: mask(email), p_region: region, p_dsn: pick.dsn, p_name: pick.name + (socks.length > 1 ? ' …' + pick.dsn.slice(-4) : ''),
    p_tz: String(body.tz || 'UTC').slice(0, 64), p_enc_refresh: await seal(key, t.refresh, h), p_enc_access: await seal(key, t.access, h), p_access_exp: new Date(t.exp).toISOString(),
  });
  // first reading right away, so the app can show asleep or awake
  await pollOne({ household_id: h, region, dsn: pick.dsn, enc_refresh: await seal(key, t.refresh, h), enc_access: await seal(key, t.access, h), access_exp: new Date(t.exp).toISOString() }, { key, rpc, api });
  return { status: await rpcUser('cradle_owlet_status', { p_h: h }) };
}

// ---- the HTTP handler (exported for tests)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export function serviceKey(env) {
  let key = '';
  try { const all = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'); key = all.default || Object.values(all)[0] || ''; } catch (_e) { key = ''; }
  return key || env('SUPABASE_SERVICE_ROLE_KEY') || '';
}
export function makeHandler({ env, fetchImpl = fetch, api }) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
    const url = env('SUPABASE_URL'), skey = serviceKey(env);
    if (!url || !skey) return reply({ error: 'missing SUPABASE_URL or service key' }, 500);
    let body = {};
    try { const t = await req.text(); body = t ? JSON.parse(t) : {}; } catch (_e) { return reply({ error: 'bad JSON' }, 400); }
    let key;
    try { key = await keyFrom(env('CRADLE_OWLET_KEY')); } catch (e) { return reply({ error: e.message }, 500); }
    const call = async (headers, fn, args) => {
      const r = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(args) });
      const t = await r.text();
      if (!r.ok) { let m = t; try { m = JSON.parse(t).message || t; } catch (_e) { /* text */ } throw new OwletError(m); }
      return t ? JSON.parse(t) : null;
    };
    const sh = { apikey: skey }; if (skey.startsWith('eyJ')) sh.Authorization = 'Bearer ' + skey;
    const rpc = (fn, args) => call(sh, fn, args);
    const owl = api || ((region) => owlet(region, { fetchImpl }));
    try {
      if (body.action === 'connect') {
        const auth = req.headers.get('authorization') || '', ak = req.headers.get('apikey') || '';
        if (!/^Bearer /.test(auth) || !ak) return reply({ error: 'Sign in to Cradle first.' }, 400);
        const rpcUser = (fn, args) => call({ apikey: ak, Authorization: auth }, fn, args);
        return reply(await connect(body, { key, rpc, rpcUser, api: owl }));
      }
      return reply(await pollAll({ key, rpc, api: owl }));
    } catch (e) {
      return reply({ error: e instanceof OwletError ? e.message : 'Something went wrong: ' + String(e && e.message || e) }, 400);
    }
  };
}

// Supabase entry point
if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(makeHandler({ env: (k) => Deno.env.get(k) }));
}
