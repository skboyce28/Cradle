import { chromium } from 'playwright';import { execSync } from 'child_process';
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const sql=q=>execSync(`psql \"${process.env.DATABASE_URL}\" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
await ctx.grantPermissions(['notifications'],{origin:'http://localhost:8098'});
await ctx.route('https://demo.supabase.co/**',async r=>{const u=r.request().url().replace('https://demo.supabase.co','http://localhost:54321');
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const resp=await r.fetch({url:u});return r.fulfill({response:resp,headers:{...resp.headers(),'access-control-allow-origin':'*'}})});
// The browser's real push service isn't reachable here, so stand in for it
await ctx.addInitScript(()=>{let cur=null;const mk=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test-'+Math.random().toString(36).slice(2),options:{applicationServerKey:null},
  toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'B'+'A'.repeat(86),auth:'A'.repeat(22)}}},unsubscribe(){cur=null;return Promise.resolve(true)}});
  if(self.PushManager){PushManager.prototype.subscribe=function(o){cur=mk();cur.options={applicationServerKey:o.applicationServerKey};window.__subCalls=(window.__subCalls||0)+1;return Promise.resolve(cur)};PushManager.prototype.getSubscription=function(){return Promise.resolve(cur)}}});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8098/');await p.waitForTimeout(1500);
const sw=await p.evaluate(()=>navigator.serviceWorker.ready.then(r=>!!r.active));ok('service worker installs',sw);
const keyBefore=sql("select count(*) from cradle_push_keys");
sql("delete from cradle_push_keys");
// sign up
const u='push'+Date.now()%1e6;
await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.click('#gGo');await p.waitForTimeout(2500);
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const openSettings=async()=>{await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(800)};
await openSettings();
ok('before the function first runs: explains and waits',/hasn’t run yet/.test(await p.innerText('#pushNote'))&&await p.isDisabled('#sPush'),await p.innerText('#pushNote'));
// the function's first run creates keys
sql(`insert into cradle_push_keys(id,public_key,private_jwk) values (1,'BOg5KfYiBdDDRF12Ry1ZuNYPFHHJXJm3Y-WhXCDOvNUZ9EnZt7Qjsy7Qyq6-SyuUH2H4ZZIG6LK6ZfnLaxPxB8U','{}')`);
await openSettings();
ok('ready: Off with an explanation',(await p.inputValue('#sPush'))==='off'&&!(await p.isDisabled('#sPush'))&&/Each phone chooses/.test(await p.innerText('#pushNote')),await p.innerText('#pushNote'));
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/push-settings.png'});
await p.selectOption('#sPush','15');await p.waitForTimeout(1200);
const row=sql(`select s.lead_min||'|'||s.tz||'|'||(s.endpoint like 'https://fcm.googleapis.com/%') from cradle_push_subs s join auth.users u on u.id=s.user_id where u.email='${u}@cradle.cfg'`);
ok('turning on saves this phone with its time zone',/^15\|America\/New_York\|(t|true)$/.test(row),row);
ok('subscribed with this Cradle’s public key',await p.evaluate(()=>window.__subCalls===1));
ok('confirmation toast',/15 minutes before/.test(await p.innerText('#toast')),await p.innerText('#toast'));
await openSettings();
ok('reopening Settings shows it on',(await p.inputValue('#sPush'))==='15'&&/^On\./.test(await p.innerText('#pushNote')));
await p.selectOption('#sPush','0');await p.waitForTimeout(1000);
ok('changing how early updates the same phone',sql(`select string_agg(lead_min::text,',') from cradle_push_subs s join auth.users u on u.id=s.user_id where u.email='${u}@cradle.cfg'`)==='0');
await p.selectOption('#sPush','off');await p.waitForTimeout(1000);
ok('turning off removes this phone',sql(`select count(*) from cradle_push_subs s join auth.users u on u.id=s.user_id where u.email='${u}@cradle.cfg'`)==='0');
// the service worker shows a pushed notification
const cdp=await ctx.newCDPSession(p);let regId=null;cdp.on('ServiceWorker.workerRegistrationUpdated',e=>{for(const r of e.registrations)if(r.scopeURL.startsWith('http://localhost:8098'))regId=r.registrationId});
await cdp.send('ServiceWorker.enable');await p.waitForTimeout(500);
await cdp.send('ServiceWorker.deliverPushMessage',{origin:'http://localhost:8098',registrationId:regId,data:JSON.stringify({title:'🍼 Feed due in 15 min · Juniper',body:'Due at 4:55pm. Last feed was at 1:55pm.',tag:'cradle-feed'})});
await p.waitForTimeout(800);
const ns=await p.evaluate(()=>navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(a=>a.map(n=>n.title+' | '+n.body+' | '+n.tag)));
ok('a push shows a notification',ns.length===1&&ns[0]==='🍼 Feed due in 15 min · Juniper | Due at 4:55pm. Last feed was at 1:55pm. | cradle-feed',JSON.stringify(ns));
await cdp.send('ServiceWorker.deliverPushMessage',{origin:'http://localhost:8098',registrationId:regId,data:JSON.stringify({title:'🍼 Feed due now',body:'x',tag:'cradle-feed'})});await p.waitForTimeout(600);
const ns2=await p.evaluate(()=>navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(a=>a.map(n=>n.title)));
ok('a newer one replaces the old one',ns2.length===1&&ns2[0]==='🍼 Feed due now',JSON.stringify(ns2));
console.log('errors',errs);await b.close();
