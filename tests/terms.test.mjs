// Terms and privacy (9-terms.sql): the same text and version in docs/terms.md, cradle.html, and the
// SQL; accepting after sign-up (recorded with version, fingerprint, time, and app version); the
// database refusing the log until then; a changed version asking again; and About showing it.
import { chromium } from 'playwright';import { execSync } from 'child_process';import fs from 'fs';import crypto from 'crypto';
import path from 'path';import { fileURLToPath } from 'url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+String(x).replace(/\s+/g,' ').slice(0,260):''));
const errs=[];

// ---- the three copies agree
const md=fs.readFileSync(path.join(repo,'docs/terms.md'),'utf8').trim();
const html=fs.readFileSync(path.join(repo,'cradle.html'),'utf8');
const m=html.match(/<script type="text\/plain" id="termsText" data-version="([^"]+)">\n([\s\S]*?)\n<\/script>/);
const sqlFile=fs.readFileSync(path.join(repo,'supabase/9-terms.sql'),'utf8');
const sv=sqlFile.match(/values \('([^']+)', '([0-9a-f]{64})'\)/);
const sha=crypto.createHash('sha256').update(md,'utf8').digest('hex');
const V=(md.match(/^Version (\S+)$/m)||[])[1];
ok('the app’s copy of the terms is exactly docs/terms.md',m&&m[2].trim()===md);
ok('one version everywhere: the text, the app, and the SQL',V&&m&&m[1]===V&&sv&&sv[1]===V,[V,m&&m[1],sv&&sv[1]].join(' '));
ok('the SQL’s fingerprint is the SHA-256 of that text',sv&&sv[2]===sha,sha);

// turn the requirement on (the runner keeps it off for other tests)
execSync(`psql "${process.env.DATABASE_URL}" -q -v ON_ERROR_STOP=1 -f "${path.join(repo,'supabase/9-terms.sql')}"`,{stdio:'ignore'});

const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return p}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const nudge=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}};
async function up(p,u){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);
  await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');
  ok('the sign-up form says terms come next',/accept this Cradle’s terms and privacy notice/.test(await txt(p,'#gNew')));
  await p.click('#gGo');await p.waitForTimeout(1200);await nudge(p)}
const gateMode=p=>p.evaluate(()=>{const g=document.getElementById('gate');return g.classList.contains('open')?g.dataset.mode:''});
const sfx=Date.now()%100000,U='terms'+sfx,W='termsw'+sfx;
const items=u=>+sql(`select count(*) from cradle_items i join cradle_members m on m.household_id=i.household_id join auth.users x on x.id=m.user_id where x.email='${u}@cradle.cfg'`);

// sign up: the terms come before the log
const P=await phone('P');await up(P,U);
ok('after sign-up, the terms screen shows instead of the log',await gateMode(P)==='terms'&&/Before your log syncs/.test(await txt(P,'#gTermsTxt'))&&/version 2026-10-15/.test(await txt(P,'#gTermsTxt')),await gateMode(P));
ok('the full text, with its headings and lists',/Cradle Terms and Privacy/.test(await txt(P,'#gTermsBody'))&&(await P.$$('#gTermsBody h2')).length>=4&&(await P.$$('#gTermsBody li')).length>=10&&/Not medical advice\./.test(await txt(P,'#gTermsBody')));
await P.screenshot({path:OUT+'terms-gate.png'});
ok('nothing has synced yet',items(U)===0);
await P.click('#gTermsGo');await P.waitForTimeout(1200);await nudge(P);
const row=sql(`select a.version||'|'||a.sha256||'|'||coalesce(a.app_version,'')||'|'||(abs(extract(epoch from now()-a.accepted_at))<120)::text from cradle_terms_acceptances a join auth.users x on x.id=a.user_id where x.email='${U}@cradle.cfg'`);
ok('accepting records the version, the text’s fingerprint, the time, and the app version',new RegExp(`^2026-10-15\\|${sha}\\|1\\.\\d+\\|true$`).test(row),row);
ok('…and the log opens and syncs',await gateMode(P)===''&&items(U)>0,items(U));
await closeModals(P);await P.click('#menuBtn');await P.click('[data-act=about]');await P.waitForTimeout(300);
const ab=await txt(P,'#aboutModal');
ok('About: the real version, and when you accepted which terms',new RegExp('Cradle v'+(html.match(/const VERSION='([^']+)'/)[1]).replace('.','\\.')).test(ab)&&/You accepted version 2026-10-15 on /.test(ab),ab.slice(0,200));
await P.click('#termsOpen');await P.waitForTimeout(300);
ok('About opens the terms to read again',await P.isVisible('#termsModal.open')&&/Changes to these terms/i.test(await txt(P,'#termsBody')));
await closeModals(P);

// the database: someone who hasn't accepted can't read or write the log
const W2=await phone('W');await up(W2,W);
ok('a second account sees the terms too',await gateMode(W2)==='terms');
const wid=sql(`select id from auth.users where email='${W}@cradle.cfg'`),wh=sql(`select household_id from cradle_members where user_id='${wid}' order by joined_at desc limit 1`);
const as=(id,q)=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}","aal":"aal1"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
sql(`insert into cradle_items(household_id,id,kind,data) values ('${wh}','day:2026-01-01','day','{}')`);
ok('not accepted: the database hides their family’s log',as(wid,`select count(*) from cradle_items where household_id='${wh}'`).split('\n').pop()==='0');
ok('…and refuses writes',/row-level security/.test(as(wid,`insert into cradle_items(household_id,id,kind,data) values ('${wh}','day:2026-01-02','day','{}')`)));
ok('a fingerprint that doesn’t match the current text is refused',/out of date/.test(as(wid,`select cradle_terms_accept('2026-10-15','${'0'.repeat(64)}')`)));
as(wid,`select cradle_terms_accept('2026-10-15','${sha}','test')`);
ok('accepted: the log is there',as(wid,`select count(*) from cradle_items where household_id='${wh}'`).split('\n').pop()==='1');
ok('accepting twice keeps one record',(as(wid,`select cradle_terms_accept('2026-10-15','${sha}','test')`),sql(`select count(*) from cradle_terms_acceptances where user_id='${wid}'`))==='1');
ok('the app can’t read the acceptance tables directly',/permission denied/.test(as(wid,`select * from cradle_terms_acceptances`)));
await W2.locator('#gTerms [data-gout]').click();await W2.waitForTimeout(800);
ok('Sign out works from the terms screen',await gateMode(W2)==='login');

// a new version: asked again; this copy of the app has the old text, so it says to reload
sql(`insert into cradle_terms(version,sha256,required_from) values ('2026-11-01','${'a'.repeat(64)}',now())`);
await P.reload();await P.clock.runFor(2500);await P.waitForTimeout(1200);await nudge(P);
ok('a new version: the terms screen says they changed since you accepted',await gateMode(P)==='terms'&&/changed since you accepted version 2026-10-15 on .*version 2026-11-01/.test(await txt(P,'#gTermsTxt')),await txt(P,'#gTermsTxt'));
await P.click('#gTermsGo');await P.waitForTimeout(500);
ok('an app with older text can’t accept the new version: it says to reload',/different terms \(version 2026-10-15\) than this Cradle needs \(version 2026-11-01\)/.test(await txt(P,'#gTermsMsg')),await txt(P,'#gTermsMsg'));
await P.screenshot({path:OUT+'terms-changed.png'});
sql(`delete from cradle_terms where version='2026-11-01'`);
await P.reload();await P.clock.runFor(2500);await P.waitForTimeout(1200);await nudge(P);
ok('back to the accepted version: straight into the log',await gateMode(P)==='');

console.log('errors',errs);await b.close();
