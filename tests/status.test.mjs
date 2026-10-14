// The status page at /status/: deployed version, deployment history from GitHub, database health
// and schema history from cradle_status(), and uptime from the 5-minute checks. Served with its
// real security headers, read without signing in.
import { chromium } from 'playwright';import { execSync } from 'child_process';import fs from 'fs';
const OUT=(process.env.CRADLE_OUT||'out')+'/',SITE='http://localhost:8097';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const LIVE='a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',OLD='0f9e8d7c6b5a49382716051f2e3d4c5b6a798000';
const iso=m=>new Date(Date.now()-m*60e3).toISOString();
// 25 commits on main, newest first: the live one, a failed one, then 23 older ones
const OLDER=Array.from({length:23},(_,i)=>{const sha=String(i).padStart(2,'0').repeat(20);return {sha,html_url:'https://github.com/skboyce28/Cradle/commit/'+sha,commit:{message:'Older change '+(i+1),author:{date:new Date(Date.now()-(300+i*60)*60e3).toISOString()}}}});
const COMMITS0=[{sha:LIVE,html_url:'https://github.com/skboyce28/Cradle/commit/'+LIVE,commit:{message:'v1.28: status page\n\nmore',author:{date:iso(30)}}},
  {sha:OLD,html_url:'https://github.com/skboyce28/Cradle/commit/'+OLD,commit:{message:'v1.27: labels',author:{date:iso(240)}}}];
const RUNS={total_count:25,workflow_runs:[{head_sha:LIVE,status:'completed',conclusion:'success',run_started_at:iso(29),updated_at:iso(23),created_at:iso(29)},{head_sha:OLD,status:'completed',conclusion:'failure',run_started_at:iso(239),updated_at:iso(233),created_at:iso(239)}]
  .concat(OLDER.map(c=>({head_sha:c.sha,status:'completed',conclusion:'success',run_started_at:c.commit.author.date,updated_at:c.commit.author.date,created_at:c.commit.author.date})))};
const ghAnswer=u=>{if(u.includes('/actions/runs'))return RUNS;const all=COMMITS0.concat(OLDER),q=new URL(u).searchParams,n=+(q.get('per_page')||30),pg=+(q.get('page')||1);return all.slice((pg-1)*n,pg*n)};

// --- database: uptime checks through the pg_net stand-in
sql(`delete from public.cradle_owlet; delete from cron.job where jobname='cradle-owlet'`);   // other tests' Owlet rows
sql(`delete from public.cradle_probes; delete from net._http_response; delete from cron.job_run_details; delete from cron.job`);
const asAnon=q=>{try{return sql(`set role anon; ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('the app can’t start checks or change the address',/permission denied/.test(asAnon(`select cradle_probe()`))&&/permission denied/.test(asAnon(`select cradle_status_set_site('https://evil.example')`)));
ok('the app can’t read the checks or the config directly',/permission denied/.test(asAnon(`select * from cradle_probes`))||asAnon(`select count(*) from cradle_probes`).split('\n').pop()==='0');
ok('the address must be a web address',/full address/.test((()=>{try{return sql(`select cradle_status_set_site('not a url')`)}catch(e){return String(e.stderr)}})()));
sql(`select cradle_status_set_site('https://cradle-test.netlify.app/status/')`);sql(`select cradle_probe()`);
const req=sql(`select url from net.test_requests order by id desc limit 1`);
ok('a check asks the site for version.json (a pasted /status/ is dropped)',/^https:\/\/cradle-test\.netlify\.app\/version\.json\?probe=\d+$/.test(req),req);
// answer it: up in 180 ms; plus history: 2 days ago one failure out of 288, and yesterday all up
sql(`insert into net._http_response(id,status_code,created) select p.req_id,200,p.at+interval '180 ms' from public.cradle_probes p where p.done_at is null`);
sql(`insert into public.cradle_probes(at,done_at,code,ok,ms) select now()-interval '2 days'+g*interval '5 min',now(),200,true,150 from generate_series(1,287) g`);
sql(`insert into public.cradle_probes(at,done_at,code,ok,err) values (now()-interval '2 days 2 hours',now(),503,false,null)`);
sql(`insert into public.cradle_probes(at,done_at,code,ok,ms) select now()-interval '1 day'+g*interval '5 min',now(),200,true,160 from generate_series(1,200) g`);
sql(`insert into public.cradle_probes(req_id,at) values (424242,now()-interval '20 minutes')`); // never answered
sql(`select cradle_probe()`);
const st=JSON.parse(asAnon(`select cradle_status()`).split('\n').pop());
ok('the answered check is recorded with its time',st.uptime.last.ok===true&&st.uptime.last.code===200&&st.uptime.last.ms===180,JSON.stringify(st.uptime.last));
ok('a check with no answer after 15 minutes counts as down',sql(`select ok::text||' '||code||' '||err from cradle_probes where req_id=424242`)==='false 0 No answer within 15 minutes');
ok('uptime percentages and 90-day days',st.uptime.pct_30d>99&&st.uptime.pct_30d<100&&st.uptime.days.length>=3&&st.uptime.incidents.length===2,JSON.stringify([st.uptime.pct_30d,st.uptime.days.length,st.uptime.incidents.length]));
ok('schema history lists each script',['1-setup.sql','2-family.sql','3-notifications.sql','5-status.sql'].every(s=>st.schema.current.some(x=>x.script===s)));
ok('only counts: no emails, names, or entries in the answer',!/@|cradle\.cfg|"name"|feed:/.test(JSON.stringify(st))&&typeof st.db.accounts==='number');
ok('old checks are deleted after 100 days',(sql(`insert into public.cradle_probes(at,done_at,ok) values (now()-interval '101 days',now(),true)`),sql(`select cradle_probe()`),sql(`select count(*) from cradle_probes where at<now()-interval '100 days'`))==='0');
// families in use: an account that joined another family isn't counted in its old solo one
const fam=()=>JSON.parse(asAnon(`select cradle_status()`).split('\n').pop()).db;const f0=fam();
const rx=()=>Math.floor(Math.random()*16**12).toString(16).padStart(12,'0'),U1='aaaaaaaa-0000-0000-0000-'+rx(),U2='aaaaaaaa-0000-0000-0000-'+rx(),H1='bbbbbbbb-0000-0000-0000-'+rx(),H2='bbbbbbbb-0000-0000-0000-'+rx();
sql(`insert into auth.users(id,email) values ('${U1}','famt1'||'${rx()}'||'@x.y'),('${U2}','famt2'||'${rx()}'||'@x.y') on conflict do nothing`);
sql(`insert into cradle_households(id,created_by) values ('${H1}','${U1}'),('${H2}','${U2}') on conflict do nothing`);
sql(`insert into cradle_members(household_id,user_id,role,joined_at) values ('${H1}','${U1}','owner',now()-interval '2 days'),('${H2}','${U2}','owner',now()-interval '1 day'),('${H2}','${U1}','member',now()) on conflict do nothing`);
const f1=fam();ok('two accounts sharing one family count as 1 family (1 shared), not 2',f1.families-f0.families===1&&f1.shared_families-f0.shared_families===1&&f1.accounts-f0.accounts===2,JSON.stringify([f0,f1].map(x=>[x.families,x.shared_families,x.accounts])));
// notification job health
sql(`insert into cron.job(jobname) values ('cradle-notify'),('cradle-status-probe')`);
sql(`insert into cron.job_run_details(jobid,status,return_message,start_time) select (select jobid from cron.job where jobname='cradle-notify'),'succeeded','1',now()-g*interval '1 min' from generate_series(1,60) g`);

// --- the page
const ctx=await b.newContext({viewport:{width:1100,height:900}});
await ctx.addInitScript(()=>{window.__v=[];document.addEventListener('securitypolicyviolation',e=>window.__v.push(e.violatedDirective+' '+e.blockedURI))});
let gh=0;await ctx.route('https://api.github.com/**',r=>{gh++;const u=r.request().url(),H={'access-control-allow-origin':'*','content-type':'application/json'};
  r.fulfill({status:200,headers:H,body:JSON.stringify(ghAnswer(u))})});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon|icon-192|Failed to load resource/.test(m.text()))errs.push(m.text())});
const resp=await p.goto(SITE+'/status/');await p.waitForTimeout(1500);
const csp=resp.headers()['content-security-policy']||'';
ok('status page has its own policy: GitHub and the database, nothing else',/connect-src 'self' https:\/\/api\.github\.com http:\/\/localhost:54321/.test(csp)&&/script-src 'self' 'sha256-/.test(csp),csp);
const ver=await (await fetch(SITE+'/version.json')).json();
ok('version.json says what’s deployed',ver.commit===LIVE&&/^\d+\.\d+$/.test(ver.version)&&ver.context==='production'&&/Z$/.test(ver.built_at),JSON.stringify(ver));
const txt=async s=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
ok('banner: all operational',/All systems operational/.test(await txt('#banner'))&&(await p.getAttribute('#banner','class')).includes('ok'),await txt('#banner'));
const comp=await txt('#components');
ok('components: website, database, notifications, tests',/Website.*Operational/.test(comp)&&/Database.*ms from your browser.*Operational/.test(comp)&&/Notifications.*60 of 60 runs OK.*Operational/.test(comp)&&/Automated tests.*GitHub Actions, on every push to main.*a1b2c3d.*Passing/.test(comp),comp);
// Owlet sleep checks: not scheduled, behind, then fine (counts only)
{const rf=async()=>{await p.click('#refresh');await p.waitForTimeout(900);return (await txt('#components')).match(/Owlet sleep.*?(?=(Automated tests|$))/)?.[0]||''};
  sql(`delete from public.cradle_owlet; delete from cron.job where jobname='cradle-owlet'`);
  let ow=await rf();ok('Owlet: set up but nothing connected or scheduled',/Owlet sleep.*No socks connected yet.*Not scheduled/.test(ow),ow);
  const hh=sql(`select id from cradle_households limit 1`),req0=sql(`select require_mfa from cradle_households where id='${hh}'`);sql(`update cradle_households set require_mfa=true where id='${hh}'`);
  sql(`insert into public.cradle_owlet(household_id,dsn,enc_refresh,ok_at,state) values ('${hh}','AC0','v1:x',now()-interval '30 minutes','asleep')`);
  ow=await rf();ok('Owlet: a sock connected but no schedule says to run 8-owlet-schedule.sql',/1 sock connected.*run supabase\/8-owlet-schedule\.sql.*Not scheduled/.test(ow),ow);
  ok('…and the banner flags it',/warn/.test(await p.getAttribute('#banner','class')));
  sql(`insert into cron.job(jobname) values ('cradle-owlet')`);
  ow=await rf();ok('Owlet: scheduled but not read in 10+ minutes is behind',/1 not read in 10\+ min.*Checks behind/.test(ow),ow);
  sql(`update public.cradle_owlet set ok_at=now()`);
  sql(`insert into cron.job_run_details(jobid,status,start_time) select (select jobid from cron.job where jobname='cradle-owlet'),'succeeded',now()-g*interval '1 min' from generate_series(1,30) g`);
  ow=await rf();ok('Owlet: healthy',/1 sock connected · last reading just now · every-minute job: 30 of 30 runs OK in 24 h.*Operational/.test(ow),ow);
  ok('no family names, emails, or serial numbers on the page',!/AC0|@/.test(ow));
  sql(`update cradle_households set require_mfa=false where id='${hh}'`);ow=await rf();
  ok('Owlet: a family that stopped requiring two-step sign-in shows as paused',/1 paused \(the family stopped requiring two-step sign-in\).*Paused/.test(ow),ow);
  sql(`update cradle_households set require_mfa=${req0==='t'} where id='${hh}'`);
  sql(`delete from public.cradle_owlet; delete from cron.job_run_details where jobid=(select jobid from cron.job where jobname='cradle-owlet'); delete from cron.job where jobname='cradle-owlet'`);
  await rf()}
ok('uptime numbers and a 90-day strip',/99\.\d\d%/.test(await txt('#upStats'))&&/~\d+ ms/.test(await txt('#upStats'))&&(await p.$$('#strip i')).length===90&&(await p.$$('#strip i.ok')).length>=1&&(await p.$$('#strip i.warn, #strip i.bad')).length>=1);
ok('live version with its commit',new RegExp('Live now v'+ver.version.replace('.','\\.')+'.*a1b2c3d').test(await txt('#live')));
const dep=await txt('#deploys');
ok('deployment history: commits with test results, the live one marked',/v1\.28: status page Live now/.test(dep)&&/Passed/.test(dep)&&/failure/.test(dep)&&(await p.$$('#deploys tr.islive')).length===1,dep);
ok('ten deployments at first, with Show 10 older',(await p.$$('#deploys tr.dep')).length===10&&/Showing the 10 most recent deployments/.test(dep)&&await p.isVisible('#depMore'));
await p.click('#depMore');await p.waitForTimeout(600);ok('Show 10 older: 20',(await p.$$('#deploys tr.dep')).length===20&&/Older change 18/.test(await txt('#deploys')));
await p.click('#depMore');await p.waitForTimeout(600);ok('then the last 5, and the button goes away',(await p.$$('#deploys tr.dep')).length===25&&/\(all of them\)/.test(await txt('#deploys'))&&!(await p.isVisible('#depMore'))&&/Older change 23/.test(await txt('#deploys')));
ok('older ones have their test results too',(await p.$$eval('#deploys tr.dep',rs=>rs.filter(r=>/Passed|failure/.test(r.textContent)).length))===25);
await p.click('#depLess');await p.waitForTimeout(300);ok('Show fewer goes back to 10',(await p.$$('#deploys tr.dep')).length===10);
// a link to one deployment
await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:SITE});
await p.click('#d-0f9e8d7 .deplink');await p.waitForTimeout(300);
ok('🔗 on a row: the address points at it, it’s highlighted, and the link is copied',p.url().endsWith('/status/#d-0f9e8d7')&&(await p.$$('#deploys tr.target')).length===1&&await p.$eval('#deploys tr.target',r=>r.id)==='d-0f9e8d7'&&(await p.evaluate(()=>navigator.clipboard.readText())).endsWith('/status/#d-0f9e8d7'));
const lp=await ctx.newPage();lp.on('pageerror',e=>errs.push(e.message));await lp.goto(SITE+'/status/#d-2020202');await lp.waitForTimeout(2500);
const tr=await lp.$('#deploys tr.target');
ok('opening a link to an older deployment loads older pages until it’s there, then scrolls to it',tr&&await tr.getAttribute('id')==='d-2020202'&&/Older change 21/.test(await tr.innerText())&&(await lp.$$('#deploys tr.dep')).length===30-5&&await tr.isVisible()&&await lp.evaluate(()=>{const r=document.querySelector('#deploys tr.target').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}));
await lp.screenshot({path:OUT+'status-link.png'});
await lp.goto(SITE+'/status/#d-1234567');await lp.reload();await lp.waitForTimeout(2500);
ok('a link to a commit that isn’t there says so',/Deployment 1234567 isn’t in main’s history/.test((await lp.innerText('#deploys')))&&(await lp.$$('#deploys tr.target')).length===0);
await lp.close();

ok('database: size against the free plan, counts, schema',/of the free plan’s 500 MB/.test(await txt('#dbSize'))&&/Families in use · \d+ shared by 2\+ people/.test(await txt('#dbSize'))&&/Last log entry added or edited by anyone/.test(await txt('#dbSize'))&&/2-family\.sql v1\.31/.test(await txt('#dbSchema'))&&/5-status\.sql v1\.36/.test(await txt('#dbSchema')));
ok('no policy violations',(await p.evaluate(()=>window.__v)).length===0,(await p.evaluate(()=>window.__v)).join(' | '));
await p.screenshot({path:OUT+'status.png',fullPage:true});
// a failed latest check and a failing test run show up in the banner
sql(`insert into public.cradle_probes(at,done_at,code,ok) values (now(),now(),502,false)`);
RUNS.workflow_runs[0].conclusion='failure';
await p.click('#refresh');await p.waitForTimeout(1200);
ok('a failed check and failing tests: needs attention',/Some things need attention: Website, Automated tests/.test(await txt('#banner'))&&(await p.getAttribute('#banner','class')).includes('warn'),await txt('#banner'));
// the database part not set up: friendly notes
sql(`revoke execute on function public.cradle_status() from anon`);
await p.click('#refresh');await p.waitForTimeout(1200);
const nt=await txt('body');ok('without the database part, the page says what to run',/(Not set up|Not reachable)/.test(await txt('#components')));
sql(`grant execute on function public.cradle_status() to anon`);
// phone width: no sideways scrolling
await p.setViewportSize({width:390,height:844});await p.click('#refresh');await p.waitForTimeout(1200);
ok('fits a phone (no sideways scroll)',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
await p.screenshot({path:OUT+'status-phone.png',fullPage:true});
// on a real phone it shows the computer layout, zoomed to fit
const mctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
await mctx.route('https://api.github.com/**',r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(ghAnswer(r.request().url()))}));
const mp=await mctx.newPage();await mp.goto(SITE+'/status/');await mp.waitForTimeout(1500);
ok('phone shows the computer layout (1000 px wide, zoomed to fit, no sideways scroll)',await mp.evaluate(()=>innerWidth>=1000&&document.documentElement.scrollWidth<=innerWidth+1&&getComputedStyle(document.querySelector('.stats')).gridTemplateColumns.split(' ').filter(x=>x!=='0px').length===5&&getComputedStyle(document.querySelector('.stat span')).fontSize==='12.5px'&&getComputedStyle(document.querySelector('#incidents .sub')).fontSize==='13px'),await mp.evaluate(()=>innerWidth+' '+getComputedStyle(document.querySelector('.stats')).gridTemplateColumns));
await mp.screenshot({path:OUT+'status-mobile.png'});await mctx.close();
// the app still works and its service worker leaves /status/ alone
const sw=fs.readFileSync(new URL('./out/sites/status/sw.js',import.meta.url),'utf8');
ok('the app’s service worker skips /status/ and version.json',/\/status\//.test(sw)&&/version\.json/.test(sw));
console.log('errors',errs);await b.close();
