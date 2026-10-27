// Owlet Dream Sock: connecting in Settings through the real cradle-owlet Edge Function code (against a
// stand-in for Owlet's Google sign-in and Ayla API), what is and isn't stored, checks that log sleep
// (with the 3- and 5-minute holds), token renewal, being signed out by Owlet, two socks, the limits,
// and the Log showing the sleep from Owlet.
import { chromium } from 'playwright';import { totp } from './support/totp.mjs';import http from 'http';import { execSync } from 'child_process';
import { makeHandler, owlet, readState, keyFrom, seal, open } from '../supabase/functions/cradle-owlet/index.ts';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+String(x).replace(/\s+/g,' ').slice(0,260):''));
const errs=[];

// ---- stand-in Owlet: Google sign-in and token refresh, the mini token, Ayla sign-in, devices, properties
const OW={password:'right-password-123',refresh:new Set(),access:new Set(),socks:[{dsn:'AC000W012345678',product_name:'Owlet Sock'}],ss:1,chg:0,bat:87,updated:()=>new Date().toISOString(),log:[],expireNext:false,n:0};
const body=req=>new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b))});
const srv=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x'),b=await body(req),J=(s,o)=>{res.writeHead(s,{'content-type':'application/json'});res.end(JSON.stringify(o))};
  OW.log.push({path:u.pathname,body:b,headers:req.headers});
  if(u.pathname==='/google/signin'){const f=new URLSearchParams(b);if(req.headers['x-android-package']!=='com.owletcare.owletcare')return J(403,{});
    if(f.get('password')!==OW.password)return J(400,{error:{message:'INVALID_LOGIN_CREDENTIALS'}});const t='R'+(++OW.n);OW.refresh.add(t);return J(200,{refreshToken:t,idToken:'x'})}
  if(u.pathname==='/google/refresh'){const f=new URLSearchParams(b),r=f.get('refreshToken');if(!OW.refresh.has(r))return J(400,{error:{message:'TOKEN_EXPIRED'}});return J(200,{id_token:'ID'+r,refresh_token:r})}
  if(u.pathname==='/mini/'){return /^IDR/.test(req.headers.authorization||'')?J(200,{mini_token:'MINI'}):J(401,{})}
  if(u.pathname==='/ayla/signin'){const j=JSON.parse(b||'{}');if(j.token!=='MINI'||j.provider!=='owl_id')return J(401,{});const a='A'+(++OW.n);OW.access.add(a);return J(200,{access_token:a,expires_in:86400})}
  const tok=(req.headers.authorization||'').replace('auth_token ','');
  if(u.pathname.startsWith('/ayla/')&&(!OW.access.has(tok)||OW.expireNext)){OW.expireNext=false;OW.access.delete(tok);return J(401,{})}
  if(u.pathname==='/ayla/devices.json')return J(200,OW.socks.map(d=>({device:d})));
  let m;if((m=u.pathname.match(/^\/ayla\/dsns\/([^/]+)\/properties\/APP_ACTIVE\/datapoints\.json$/)))return J(201,{});
  if((m=u.pathname.match(/^\/ayla\/dsns\/([^/]+)\/properties\.json$/))){
    return J(200,[{property:{name:'REAL_TIME_VITALS',value:JSON.stringify({ss:OW.ss,chg:OW.chg,bat:OW.bat,hr:131,ox:97,sc:2}),data_updated_at:OW.updated()}},{property:{name:'SOCK_OFF',value:0}},{property:{name:'oem_sock_version',value:'{"rev":5}'}}])}
  J(404,{})}).listen(8093);
const O='http://localhost:8093';
const api=region=>owlet(region,{google:{signin:O+'/google/signin',refresh:O+'/google/refresh'},regions:{world:{mini:O+'/mini/',signin:O+'/ayla/signin',base:O+'/ayla',apiKey:'k',appId:'a',appSecret:'s'},europe:{mini:O+'/mini/',signin:O+'/ayla/signin',base:O+'/ayla',apiKey:'k',appId:'a',appSecret:'s'}}});
const OKEY=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const ENV={SUPABASE_URL:DB,SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_testkey_0987654321'}),CRADLE_OWLET_KEY:OKEY};
const handler=makeHandler({env:k=>ENV[k],api});
const poll=async()=>{const r=await handler(new Request('http://f/',{method:'POST',body:'{}'}));return r.json()};

// ---- unit checks
ok('reads asleep, awake, charging, a stale reading, and sock off; never heart rate or oxygen',(()=>{const P=(v,x={})=>({REAL_TIME_VITALS:{value:JSON.stringify(v),data_updated_at:new Date().toISOString()},...x});
  const a=readState(P({ss:15,bat:80,hr:120,ox:97})),b=readState(P({ss:8})),c=readState(P({ss:1})),d=readState(P({ss:15,chg:1})),e=readState({REAL_TIME_VITALS:{value:'{"ss":15}',data_updated_at:new Date(Date.now()-20*60e3).toISOString()}}),f=readState(P({ss:15},{SOCK_OFF:{value:1}})),g=readState(P({ss:0})),h=readState({CHARGE_STATUS:{value:0}});
  return a.state==='asleep'&&a.battery===80&&b.state==='asleep'&&c.state==='awake'&&d.state==='charging'&&e.state==='off'&&f.state==='off'&&g.state==='unknown'&&h.state==='unsupported'&&Object.keys(a).sort().join()==='battery,state'})());
{const k=await keyFrom(OKEY),s=await seal(k,'secret-token','h1');let moved=false;try{await open(k,s,'h2')}catch(e){moved=true}
  ok('tokens are encrypted, and can’t be decrypted for another family',/^v1:/.test(s)&&!s.includes('secret-token')&&(await open(k,s,'h1'))==='secret-token'&&moved)}
{const h2=makeHandler({env:k=>({...ENV,CRADLE_OWLET_KEY:''})[k],api});const r=await h2(new Request('http://f/',{method:'POST',body:'{}'}));const j=await r.json();
  ok('without the CRADLE_OWLET_KEY secret it says how to fix it',r.status===500&&/CRADLE_OWLET_KEY must be 32 random bytes/.test(j.error),j.error)}

// ---- the app
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true,timezoneId:'America/New_York'});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  // the browser's call to the Edge Function runs the real handler in this process
  await ctx.route(DB+'/functions/v1/cradle-owlet',async r=>{const q=r.request();const res=await handler(new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.method()==='POST'?q.postData():undefined}));
    r.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()})});
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return p}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function up(p,u){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);
  await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
const openSettings=async p=>{await closeModals(p);await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(900)};
const U='owl'+(Date.now()%100000);
const P=await phone('parent');await up(P,U);
await openSettings(P);ok('no sleep or Owlet settings until Sleep is turned on',!(await P.isVisible('#sSleep'))&&!(await P.isVisible('#owlBox'))&&!(await P.isVisible('#sOwl')));
await P.check('#sTrSleep');await P.waitForSelector('#askModal.open');
ok('turning on Sleep asks about a Dream Sock right away, with the sleep goal already showing',/Do you have an Owlet Dream Sock/.test(await txt(P,'#askMsg'))&&(await txt(P,'#askOk'))==='Yes, set it up'&&(await txt(P,'#askCancel'))==='No'&&await P.isVisible('#sSleep'));
await P.screenshot({path:OUT+'owlet-ask.png'});
await P.click('#askOk');await P.waitForTimeout(400);
ok('Yes, but the family doesn’t require two-step sign-in: no form, and the owner is offered Family',await P.isChecked('#sOwl')&&!(await P.isVisible('#owlEmail'))&&/needs two-step sign-in for everyone in your family/.test(await txt(P,'#owlBox'))&&await P.isVisible('#owlFam'),await txt(P,'#owlBox'));
await P.screenshot({path:OUT+'owlet-needs-mfa.png'});
await P.click('#sSave');await P.clock.runFor(300);
const H=sql(`select household_id from cradle_members m join auth.users u on u.id=m.user_id where u.email='${U}@cradle.cfg' order by joined_at desc limit 1`);
// the database refuses too, even for a modified app
{const id=sql(`select id from auth.users where email='${U}@cradle.cfg'`);let e='';try{sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}","aal":"aal2"}',false); select cradle_owlet_check('${H}')`)}catch(x){e=String(x.stderr)}
  ok('the database refuses to connect a sock for a family that doesn’t require it',/must require two-step sign-in to connect a Dream Sock/.test(e),e)}
// set up two-step sign-in, then require it for the family from the Owlet section's button
await closeModals(P);await P.click('#menuBtn');await P.click('[data-act=mfa]');await P.waitForTimeout(600);await P.click('#mfaStart');await P.waitForSelector('#mfaBody #mfaKey');
const sec=(await P.innerText('#mfaBody #mfaKey')).replace(/\s/g,'');await P.fill('#mfaCode',totp(sec));await P.click('[data-mfaon]');await P.waitForTimeout(900);
await openSettings(P);await P.click('#owlFam');await P.waitForTimeout(900);
ok('“Require it in Family” opens the Family screen',await P.isVisible('#familyModal.open #famMfa'));
await P.click('#famMfa');await P.waitForSelector('#askModal.open');await P.click('#askOk');await P.waitForTimeout(1200);
ok('the family now requires it',sql(`select require_mfa from cradle_households where id='${H}'`)==='t');
await openSettings(P);await P.waitForTimeout(600);
ok('then the connect form shows',await P.isVisible('#owlEmail')&&await P.isVisible('#owlPass'));
ok('Settings: the Owlet section explains the password isn’t saved',await P.isVisible('#owlBox')&&/password is used once to connect and is never saved/.test(await txt(P,'#owlBox')),await txt(P,'#owlBox'));
// wrong password
await P.fill('#owlEmail','jules@example.com');await P.fill('#owlPass','wrong');await P.click('#owlGo');await P.waitForTimeout(900);
ok('wrong password: Owlet’s answer, and nothing saved',/That Owlet email or password isn’t right/.test(await txt(P,'#owlBox'))&&sql(`select count(*) from cradle_owlet where household_id='${H}'`)==='0'&&(await P.inputValue('#owlPass'))==='');
// connect
OW.ss=1;
await P.fill('#owlEmail','jules@example.com');await P.fill('#owlPass',OW.password);await P.click('#owlGo');await P.waitForTimeout(1500);
ok('connected: the sock, the masked account, awake, battery, just checked',/Owlet Sock · j•••@example\.com/.test(await txt(P,'#owlBox'))&&/Awake since .* battery 87% · checked just now/i.test(await txt(P,'#owlBox')),await txt(P,'#owlBox'));
await P.screenshot({path:OUT+'owlet-settings.png'});
ok('connecting turns Sleep on for the family without tapping Save',await P.evaluate(()=>{const S=JSON.parse(localStorage.getItem('cradle-feeding-v1'));return S.settings.track.sleep===true&&S.settings.owlet===true}));
await closeModals(P);for(let i=0;i<3;i++)await settle(P);
ok('…and it syncs, so the server logs sleep for this family',sql(`select data->'track'->>'sleep'||'|'||(data->>'owlet') from cradle_items where household_id='${H}' and id='settings'`)==='true|true');
const row=sql(`select row_to_json(o)::text from cradle_owlet o where household_id='${H}'`);
ok('stored: encrypted tokens only; no password, email, or raw token',/"enc_refresh":"v1:/.test(row)&&!row.includes(OW.password)&&!row.includes('jules@example.com')&&![...OW.refresh,...OW.access].some(t=>new RegExp('"'+t+'"').test(row))&&/"account_hint":"j•••@example.com"/.test(row)&&/"tz":"America\/New_York"/.test(row),row.slice(0,200));
ok('the password went only to Owlet’s sign-in',OW.log.filter(l=>l.body.includes(OW.password)).every(l=>l.path==='/google/signin'));
// (the encrypted tokens are random text that can contain "131" by chance, so they're left out of this check)
const plain=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(row)).filter(([k])=>!/^enc_/.test(k))));
ok('vitals aren’t stored anywhere',!/131|"hr"|"ox"/.test(plain)&&sql(`select count(*) from cradle_items where household_id='${H}' and data::text ~ '"(hr|ox)"'`)==='0');

// asleep: held 3 minutes before it starts
OW.ss=15;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);
let r=await poll();
ok('the scheduled answer is counts only: no states, families, or serial numbers',Object.keys(r).sort().join()==='checked,errors,ok'&&!/asleep|awake|AC0|[0-9a-f]{8}-/.test(JSON.stringify(r)),JSON.stringify(r));
ok('the every-minute check: asleep seen, not logged yet',r.checked>=1&&sql(`select state||'|'||pend_state from cradle_owlet where household_id='${H}'`)==='awake|asleep'&&sql(`select count(*) from cradle_items where household_id='${H}' and data->>'src'='owlet'`)==='0',JSON.stringify(r));
r=await poll();ok('a second check within 50 seconds is skipped',r.checked===0,JSON.stringify(r));
sql(`update cradle_owlet set pend_since=now()-interval '12 minutes', polled_at=null where household_id='${H}'`);
r=await poll();
const it=sql(`select data::text from cradle_items where household_id='${H}' and data->>'src'='owlet'`);
const startNY=sql(`select to_char((now()-interval '12 minutes') at time zone 'America/New_York','HH24:MI')`);
ok('after 3 minutes asleep a sleep is logged (backdated 12 minutes here), from when it was first seen, in the family’s time',JSON.parse(it).sleep===true&&JSON.parse(it).end===''&&JSON.parse(it).time===startNY&&JSON.parse(it).src==='owlet',it);
// the app shows it
await closeModals(P);for(let i=0;i<4;i++)await settle(P);await P.clock.runFor(61000);await P.waitForTimeout(1200);
ok('the Log shows the baby asleep, from Owlet',/Asleep \d+m since .* from Owlet · 🦉 Asleep, checked (just now|1 min ago)/.test(await txt(P,'#sleepLine'))&&(await txt(P,'#addSleep'))==='☀️ Woke up',await txt(P,'#sleepLine'));
ok('the row is marked from Owlet',/from Owlet/.test(await txt(P,'.feed.sleeprow')));
await P.screenshot({path:OUT+'owlet-log.png'});
// awake: held 5 minutes
OW.ss=1;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);await poll();
ok('awake seen: the sleep keeps going for now',sql(`select data->>'end' from cradle_items where household_id='${H}' and data->>'src'='owlet'`)==='');
sql(`update cradle_owlet set pend_since=now()-interval '6 minutes', polled_at=null where household_id='${H}'`);await poll();
const it2=JSON.parse(sql(`select data::text from cradle_items where household_id='${H}' and data->>'src'='owlet'`));
ok('after 5 minutes awake the wake time and length are filled in',it2.end===sql(`select to_char((now()-interval '6 minutes') at time zone 'America/New_York','HH24:MI')`)&&it2.mins>=1,JSON.stringify(it2));
for(let i=0;i<4;i++)await settle(P);
ok('…and the Log shows it ended',(await txt(P,'#addSleep'))==='😴 Asleep'&&/Awake/.test(await txt(P,'#sleepLine')),(await txt(P,'#addSleep'))+' | '+(await txt(P,'#sleepLine')));
// someone tapped Asleep first: Owlet keeps theirs instead of adding another
await P.click('#addSleep');await P.clock.runFor(300);for(let i=0;i<3;i++)await settle(P);
OW.ss=8;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);await poll();sql(`update cradle_owlet set pend_since=now()-interval '12 minutes', polled_at=null where household_id='${H}'`);await poll();
ok('a sleep someone already started is kept, not doubled',sql(`select count(*) from cradle_items where household_id='${H}' and data->>'sleep'='true' and coalesce(data->>'end','')='' and not deleted`)==='1'&&sql(`select open_item not like 'feed:owl%' from cradle_owlet where household_id='${H}'`)==='t');
OW.ss=1;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);await poll();sql(`update cradle_owlet set pend_since=now()-interval '6 minutes', polled_at=null where household_id='${H}'`);await poll();
ok('…and Owlet fills in its wake time',sql(`select count(*) from cradle_items where household_id='${H}' and data->>'sleep'='true' and coalesce(data->>'end','')='' and not deleted`)==='0');
// charging ends a sleep too
OW.ss=15;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);await poll();sql(`update cradle_owlet set pend_since=now()-interval '12 minutes', polled_at=null where household_id='${H}'`);await poll();
OW.chg=1;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);await poll();sql(`update cradle_owlet set pend_since=now()-interval '6 minutes', polled_at=null where household_id='${H}'`);await poll();
ok('putting the sock on the charger ends the sleep',sql(`select state from cradle_owlet where household_id='${H}'`)==='charging'&&sql(`select count(*) from cradle_items where household_id='${H}' and data->>'sleep'='true' and coalesce(data->>'end','')=''`)==='0');
OW.chg=0;
// token renewal
const encA=sql(`select enc_access from cradle_owlet where household_id='${H}'`);
sql(`update cradle_owlet set access_exp=now()-interval '1 minute', polled_at=null where household_id='${H}'`);await poll();
ok('an expired Owlet token is renewed with the stored sign-in token, no password',sql(`select enc_access from cradle_owlet where household_id='${H}'`)!==encA&&sql(`select error is null from cradle_owlet where household_id='${H}'`)==='t');
OW.expireNext=true;sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);r=await poll();
ok('a token Owlet rejects early is renewed and the check still works',r.checked===1&&r.ok===1&&r.errors===0&&sql(`select error is null from cradle_owlet where household_id='${H}'`)==='t',JSON.stringify(r));
// Owlet signs Cradle out
OW.refresh.clear();OW.access.clear();sql(`update cradle_owlet set access_exp=now()-interval '1 minute', polled_at=null where household_id='${H}'`);await poll();
ok('signed out by Owlet: checks stop and it asks to connect again',sql(`select needs_reconnect from cradle_owlet where household_id='${H}'`)==='t'&&sql(`select count(*) from cradle_owlet where household_id='${H}' and polled_at > now() - interval '1 second'`)==='0'||sql(`select needs_reconnect from cradle_owlet where household_id='${H}'`)==='t');
r=await poll();ok('…and isn’t checked again until reconnected',r.checked===0);
await openSettings(P);await P.waitForTimeout(500);
ok('Settings says to connect again, with the form',/Owlet signed Cradle out/.test(await txt(P,'#owlBox'))&&await P.isVisible('#owlPass'));
ok('the Log line says so too',(await closeModals(P),/Owlet needs connecting again/.test(await txt(P,'#sleepLine'))),await txt(P,'#sleepLine'));
// two socks: pick one
OW.socks=[{dsn:'AC000W011111111',product_name:'Owlet Sock'},{dsn:'AC000W022222222',product_name:'Owlet Sock'}];
await openSettings(P);await P.fill('#owlEmail','jules@example.com');await P.fill('#owlPass',OW.password);await P.click('#owlGo');await P.waitForTimeout(1200);
ok('two socks on the account: it asks which',(await P.$$('#owlBox [data-owldsn]')).length===2&&/More than one sock/.test(await txt(P,'#owlBox')));
await P.click('#owlBox [data-owldsn="AC000W022222222"]');await P.waitForTimeout(1500);
ok('the chosen sock is connected',sql(`select dsn||'|'||needs_reconnect from cradle_owlet where household_id='${H}'`)==='AC000W022222222|false'&&/Owlet Sock …2222/.test(await txt(P,'#owlBox')),await txt(P,'#owlBox'));
// sleep tracking off: still checked, nothing logged
sql(`update cradle_items set data=jsonb_set(data,'{track,sleep}','false') where household_id='${H}' and id='settings'`);
const before=sql(`select count(*) from cradle_items where household_id='${H}' and data->>'src'='owlet'`);
OW.ss=15;sql(`update cradle_owlet set polled_at=null,state='awake',pend_state=null where household_id='${H}'`);await poll();sql(`update cradle_owlet set pend_since=now()-interval '12 minutes', polled_at=null where household_id='${H}'`);await poll();
ok('with Sleep turned off in Settings, nothing is logged',sql(`select count(*) from cradle_items where household_id='${H}' and data->>'src'='owlet'`)===before&&sql(`select state from cradle_owlet where household_id='${H}'`)==='asleep');
sql(`update cradle_items set data=jsonb_set(data,'{track,sleep}','true') where household_id='${H}' and id='settings'`);
// limits in the database
const uid=sql(`select id from auth.users where email='${U}@cradle.cfg'`);
const as=(id,q,aal='aal2')=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}","aal":"${aal}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
const other=sql(`insert into auth.users(email) values ('owlother${Date.now()%100000}@t.co') returning id`).split('\n')[0];
ok('someone outside the family can’t see or change the connection',/not a member/.test(as(other,`select cradle_owlet_status('${H}')`))&&/not a member/.test(as(other,`select cradle_owlet_disconnect('${H}')`))&&/not a member/.test(as(other,`select cradle_owlet_check('${H}')`)));
ok('the app can’t read the table or call the Edge Function’s own functions',/permission denied/.test(as(uid,`select enc_refresh from cradle_owlet`))&&/permission denied/.test(as(uid,`select cradle_owlet_due()`))&&/permission denied/.test(as(uid,`select cradle_owlet_record('${H}','asleep')`)));
for(let i=0;i<10;i++)as(uid,`select cradle_owlet_check('${H}')`);
ok('a password-only sign-in can’t connect or read the sock’s state',/Finish two-step sign-in first/.test(as(uid,`select cradle_owlet_check('${H}')`,'aal1'))&&/"locked" *: *true/.test(as(uid,`select cradle_owlet_status('${H}')`,'aal1').replace(/\s/g,'')));
ok('at most 10 connection tries an hour',/Too many tries/.test(as(uid,`select cradle_owlet_check('${H}')`)));
sql(`delete from cradle_owlet_tries where user_id='${uid}'`);
// the owner stops requiring two-step sign-in: checks pause, the token stays; turning it back on resumes
sql(`update cradle_households set require_mfa=false where id='${H}'`);sql(`update cradle_owlet set polled_at=null where household_id='${H}'`);
r=await poll();ok('paused: not checked while the family doesn’t require it, and the token is kept',r.checked===0&&sql(`select count(*) from cradle_owlet where household_id='${H}' and enc_refresh like 'v1:%'`)==='1',JSON.stringify(r));
await openSettings(P);await P.waitForTimeout(700);
ok('Settings says it’s paused and why, with Require it in Family',/Paused: your family no longer requires two-step sign-in/.test(await txt(P,'#owlBox'))&&await P.isVisible('#owlFam'),await txt(P,'#owlBox'));
await P.screenshot({path:OUT+'owlet-paused.png'});
await closeModals(P);ok('the Log line says paused',/Owlet paused/.test(await txt(P,'#sleepLine')),await txt(P,'#sleepLine'));
sql(`update cradle_households set require_mfa=true where id='${H}'`);r=await poll();
ok('required again: checks resume without the Owlet password',r.checked===1&&r.ok===1,JSON.stringify(r));
// unticking the box while connected asks first
await openSettings(P);await P.uncheck('#sOwl');await P.waitForSelector('#askModal.open');await P.click('#askCancel');await P.waitForTimeout(300);
ok('unticking the Dream Sock box while connected asks to disconnect; No keeps it',await P.isChecked('#sOwl')&&sql(`select count(*) from cradle_owlet where household_id='${H}'`)==='1');
// disconnect
await P.click('#owlOff');await P.click('#askOk');await P.waitForTimeout(800);
ok('Disconnect deletes the stored token; logged sleep stays',sql(`select count(*) from cradle_owlet where household_id='${H}'`)==='0'&&+sql(`select count(*) from cradle_items where household_id='${H}' and data->>'src'='owlet'`)>=1&&await P.isVisible('#owlPass'));
// another family says No: the box stays unticked and greyed, and can be ticked later
const Q=await phone('other');await up(Q,'owlno'+(Date.now()%100000));
await openSettings(Q);await Q.check('#sTrSleep');await Q.waitForSelector('#askModal.open');await Q.click('#askCancel');await Q.waitForTimeout(300);
ok('No: the Dream Sock box is unticked and greyed, with no form',!(await Q.isChecked('#sOwl'))&&await Q.$eval('#sOwl',e=>e.closest('.owlchk').classList.contains('off'))&&!(await Q.isVisible('#owlBox')));
await Q.screenshot({path:OUT+'owlet-no.png'});
await Q.click('#sSave');await Q.clock.runFor(300);
ok('the answer is saved for the family',await Q.evaluate(()=>{const S=JSON.parse(localStorage.getItem('cradle-feeding-v1'));return S.settings.track.sleep===true&&S.settings.owlet===false}));
await openSettings(Q);await Q.uncheck('#sTrSleep');await Q.check('#sTrSleep');await Q.waitForTimeout(400);
ok('turning Sleep off and on again doesn’t ask again',!(await Q.isVisible('#askModal.open')));
await Q.check('#sOwl');await Q.waitForTimeout(300);
ok('ticking it later shows the two-step sign-in requirement first (this family doesn’t require it)',await Q.isVisible('#owlFam')&&!(await Q.isVisible('#owlEmail'))&&!(await Q.$eval('#sOwl',e=>e.closest('.owlchk').classList.contains('off'))));
console.log('errors',errs);await b.close();srv.close();
