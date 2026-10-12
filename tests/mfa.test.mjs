// Two-step sign-in: turning it on for yourself, the code step at sign-in, the family owner's
// "require it for everyone" rule, setting it up when the family requires it, and the database
// refusing the log to a sign-in that only used a password.
import { chromium } from 'playwright';import { execSync } from 'child_process';
import { totp } from './support/totp.mjs';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return p}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function form(p,u){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);await p.fill('#gUser',u);await p.fill('#gPass','longenough1')}
async function up(p,u,key=''){await form(p,u);await p.click('#gMode');await p.fill('#gPass2','longenough1');await p.fill('#gShare',key);await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
async function signIn(p,u){await form(p,u);await p.click('#gGo');await p.waitForTimeout(1500);await p.clock.runFor(500)}
const gateMode=p=>p.evaluate(()=>{const g=document.getElementById('gate');return g.classList.contains('open')?g.dataset.mode:''});
const items=p=>p.evaluate(async([db,k])=>{const s=JSON.parse(localStorage.getItem('cradle-cloud-v1')).session;const r=await fetch(db+'/rest/v1/cradle_items?select=id',{headers:{apikey:k,Authorization:'Bearer '+s.access}});return (await r.json()).length},[DB,KEY]);
const aal=p=>p.evaluate(()=>{const t=JSON.parse(localStorage.getItem('cradle-cloud-v1')).session.access;return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).aal});
const secretOf=async(p,box)=>(await p.innerText(box+' #mfaKey')).replace(/\s/g,'');
const sfx=Date.now()%100000,A='amfa'+sfx,B='bmfa'+sfx,C='cmfa'+sfx;
const factor=u=>sql(`select status from auth.mfa_factors f join auth.users u on u.id=f.user_id where u.email='${u}@cradle.cfg' order by f.created_at desc limit 1`);

// 1) A turns it on for themselves
const P=await phone('A');await up(P,A);
await P.click('#menuBtn');ok('menu has Sign-in and security',/Sign-in and security/.test(await txt(P,'#dd')));
await P.click('[data-act=mfa]');await P.waitForTimeout(600);
ok('starts Off, with Set up, under Change password',/Off/.test(await txt(P,'#mfaBody'))&&await P.isVisible('#mfaStart')&&await P.isVisible('#mfaPw'));
await P.click('#mfaStart');await P.waitForSelector('#mfaBody #mfaKey');
const sA=await secretOf(P,'#mfaBody');
ok('setup shows the QR code, a link for this phone, and the setup key',await P.isVisible('#mfaBody .mfaqr img')&&/^otpauth:\/\/totp\/Cradle:.*secret=/.test(await P.getAttribute('#mfaLink','href'))&&/^[A-Z2-7]{16,}$/.test(sA),sA);
await P.screenshot({path:OUT+'mfa-setup.png'});
await P.fill('#mfaCode','000000');await P.click('[data-mfaon]');await P.waitForTimeout(600);
ok('a wrong code is refused',/didn.t match/.test(await txt(P,'#mfaBody [data-mfamsg]'))&&factor(A)==='unverified');
await P.fill('#mfaCode',totp(sA));await P.click('[data-mfaon]');await P.waitForTimeout(800);
ok('right code turns it on',/On/.test(await txt(P,'#mfaBody'))&&factor(A)==='verified'&&await aal(P)==='aal2',factor(A));
ok('Turn off is offered (no family rule)',await P.isVisible('#mfaOff'));
await closeModals(P);await P.click('#menuBtn');ok('menu shows On',(await txt(P,'#ddMfa'))==='On');await P.click('#menuBtn');
await settle(P);ok('A still syncs after turning it on',await items(P)>0);

// 2) A on a new phone: password, then the code
const Q=await phone('A2');await signIn(Q,A);
ok('after the password, Cradle asks for the code',await gateMode(Q)==='mfa'&&await Q.isVisible('#gCode'));
ok('the password-only sign-in can’t read the log',await aal(Q)==='aal1'&&await items(Q)===0);
await Q.screenshot({path:OUT+'mfa-code.png'});
await Q.fill('#gCode','123456');await Q.click('#gCodeGo');await Q.waitForTimeout(800);
ok('a wrong code keeps the gate up',await gateMode(Q)==='mfa'&&/didn.t match/.test(await txt(Q,'#gCodeMsg')));
await Q.fill('#gCode',totp(sA));await Q.waitForTimeout(1000);await Q.clock.runFor(500);   // six digits submit by themselves
ok('the right code opens Cradle',await gateMode(Q)===''&&await aal(Q)==='aal2'&&await items(Q)>0,await gateMode(Q));
await settle(Q);await Q.reload();await Q.clock.runFor(2500);await Q.waitForTimeout(800);await Q.clock.runFor(500);
ok('reopening Cradle keeps the code step done',await gateMode(Q)==='');
await Q.context().close();

// 3) B joins A's family; A requires two-step sign-in
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='${A}@cradle.cfg'`);
const R=await phone('B');await up(R,B,famKey);
ok('B joined and syncs with just a password (not required yet)',await items(R)>0&&await gateMode(R)==='');
await R.click('#menuBtn');await R.click('[data-act=family]');await R.waitForTimeout(1200);
ok('B sees it’s optional, and that A has it on',/Optional in this family/.test(await txt(R,'#famBody'))&&/Owner · 🔐 Two-step on/.test(await txt(R,'#famBody'))&&!(await R.isVisible('#famMfa')));
await closeModals(R);
await P.click('#menuBtn');await P.click('[data-act=family]');await P.waitForTimeout(1200);
ok('owner sees the require switch, off',await P.isVisible('#famMfa')&&!(await P.isChecked('#famMfa')));
await P.click('#famMfa');await P.waitForTimeout(200);ok('asks first',/Require two-step sign-in for everyone/.test(await txt(P,'#askMsg')));
await P.click('#askOk');await P.waitForTimeout(800);
ok('now required',await P.isChecked('#famMfa')&&sql(`select require_mfa from cradle_households where join_code='${famKey}'`)==='t'&&/Two-step not set up yet/.test(await txt(P,'#famBody')));
await P.screenshot({path:OUT+'mfa-family.png'});await closeModals(P);

// 4) B is asked to set it up the next time Cradle opens
ok('B’s password-only sign-in now gets nothing',await items(R)===0);
await R.reload();await R.clock.runFor(2500);await R.waitForTimeout(1200);await R.clock.runFor(500);await R.waitForSelector('#gMfaSetBody #mfaKey',{timeout:8000}).catch(()=>{});
ok('B sees the family’s setup screen',await gateMode(R)==='mfasetup'&&/asks everyone to use two-step sign-in/.test(await txt(R,'#gMfaSetTxt')),await gateMode(R));
await R.screenshot({path:OUT+'mfa-required.png'});
const sB=await secretOf(R,'#gMfaSetBody');await R.fill('#gMfaSetBody #mfaCode',totp(sB));await R.click('#gMfaSetBody [data-mfaon]');await R.waitForTimeout(1200);await R.clock.runFor(500);
ok('after setting it up, B is in',await gateMode(R)===''&&factor(B)==='verified'&&await items(R)>0);
await R.click('#menuBtn');await R.click('[data-act=mfa]');await R.waitForTimeout(600);
ok('B can’t turn it off while the family requires it',/requires two-step sign-in, so it stays on/.test(await txt(R,'#mfaBody'))&&!(await R.isVisible('#mfaOff')));
await closeModals(R);

// 5) Someone without it can't require it; the database checks too
const S=await phone('C');await up(S,C);
await S.click('#menuBtn');await S.click('[data-act=family]');await S.waitForTimeout(1200);await S.click('#famMfa');await S.waitForTimeout(200);
ok('owner without it is asked to set it up first',/Set up two-step sign-in for yourself first/.test(await txt(S,'#askMsg')));
await S.click('#askOk');await S.waitForTimeout(600);ok('and that opens the setup',await S.isVisible('#mfaModal'));await closeModals(S);
const uidC=sql(`select id from auth.users where email='${C}@cradle.cfg'`),hC=sql(`select household_id from cradle_members where user_id='${uidC}'`);
const asC=(aal,q)=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uidC}","aal":"${aal}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('database refuses the rule from an owner without it',/for yourself first/.test(asC('aal2',`select cradle_set_mfa_policy('${hC}',true)`)));
const uidB=sql(`select id from auth.users where email='${B}@cradle.cfg'`),hA=sql(`select id from cradle_households where join_code='${famKey}'`);
const asB=(aal,q)=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uidB}","aal":"${aal}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('a member can’t change the rule',/only the family owner/.test(asB('aal2',`select cradle_set_mfa_policy('${hA}',false)`)));
ok('a password-only sign-in can’t add to the log',/two-step sign-in/.test(asB('aal1',`insert into cradle_items(household_id,id,kind,data) values ('${hA}','feed:x','feed','{}')`)));
ok('a password-only sign-in doesn’t get the share key',asB('aal1',`select coalesce(cradle_family_info('${hA}')->>'join_code','hidden')`).split('\n').pop()==='hidden'&&asB('aal2',`select cradle_family_info('${hA}')->>'join_code'`).split('\n').pop()===famKey);
ok('family actions wait for the code step',/Finish two-step sign-in first/.test(asB('aal1',`select cradle_rename('${hA}','Hacked')`)));

// 6) The owner makes it optional again; A turns theirs off
await P.click('#menuBtn');await P.click('[data-act=family]');await P.waitForTimeout(1200);await P.click('#famMfa');await P.click('#askOk');await P.waitForTimeout(800);
ok('optional again',!(await P.isChecked('#famMfa'))&&sql(`select require_mfa from cradle_households where id='${hA}'`)==='f');await closeModals(P);
await P.click('#menuBtn');await P.click('[data-act=mfa]');await P.waitForTimeout(600);await P.click('#mfaOff');await P.click('#askOk');await P.waitForTimeout(800);
ok('A turned it off',/Off/.test(await txt(P,'#mfaBody'))&&factor(A)===''&&await P.isVisible('#mfaStart'));
console.log('errors',errs);await b.close();
