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
const COMMITS=[{sha:LIVE,html_url:'https://github.com/skboyce28/Cradle/commit/'+LIVE,commit:{message:'v1.28: status page\n\nmore',author:{date:iso(30)}}},
  {sha:OLD,html_url:'https://github.com/skboyce28/Cradle/commit/'+OLD,commit:{message:'v1.27: labels',author:{date:iso(240)}}}];
const RUNS={workflow_runs:[{head_sha:LIVE,status:'completed',conclusion:'success',run_started_at:iso(29),updated_at:iso(23)},{head_sha:OLD,status:'completed',conclusion:'failure',run_started_at:iso(239),updated_at:iso(233)}]};

// --- database: uptime checks through the pg_net stand-in
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
// notification job health
sql(`insert into cron.job(jobname) values ('cradle-notify'),('cradle-status-probe')`);
sql(`insert into cron.job_run_details(jobid,status,return_message,start_time) select (select jobid from cron.job where jobname='cradle-notify'),'succeeded','1',now()-g*interval '1 min' from generate_series(1,60) g`);

// --- the page
const ctx=await b.newContext({viewport:{width:1100,height:900}});
await ctx.addInitScript(()=>{window.__v=[];document.addEventListener('securitypolicyviolation',e=>window.__v.push(e.violatedDirective+' '+e.blockedURI))});
let gh=0;await ctx.route('https://api.github.com/**',r=>{gh++;const u=r.request().url(),H={'access-control-allow-origin':'*','content-type':'application/json'};
  r.fulfill({status:200,headers:H,body:JSON.stringify(u.includes('/actions/runs')?RUNS:COMMITS)})});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon|icon-192|Failed to load resource/.test(m.text()))errs.push(m.text())});
const resp=await p.goto(SITE+'/status/');await p.waitForTimeout(1500);
const csp=resp.headers()['content-security-policy']||'';
ok('status page has its own policy: GitHub and the database, nothing else',/connect-src 'self' https:\/\/api\.github\.com http:\/\/localhost:54321/.test(csp)&&/script-src 'self' 'sha256-/.test(csp),csp);
const ver=await (await fetch(SITE+'/version.json')).json();
ok('version.json says what’s deployed',ver.commit===LIVE&&/^\d+\.\d+$/.test(ver.version)&&ver.context==='production'&&/Z$/.test(ver.built_at),JSON.stringify(ver));
const txt=async s=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
ok('banner: all operational',/All systems operational/.test(await txt('#banner'))&&(await p.getAttribute('#banner','class')).includes('ok'),await txt('#banner'));
const comp=await txt('#components');
ok('components: website, database, notifications, tests',/Website.*Operational/.test(comp)&&/Database.*ms from your browser.*Operational/.test(comp)&&/Notifications.*60 of 60 runs OK.*Operational/.test(comp)&&/Tests on main.*a1b2c3d.*Passing/.test(comp),comp);
ok('uptime numbers and a 90-day strip',/99\.\d\d%/.test(await txt('#upStats'))&&/~\d+ ms/.test(await txt('#upStats'))&&(await p.$$('#strip i')).length===90&&(await p.$$('#strip i.ok')).length>=1&&(await p.$$('#strip i.warn, #strip i.bad')).length>=1);
ok('live version with its commit',new RegExp('Live now v'+ver.version.replace('.','\\.')+'.*a1b2c3d').test(await txt('#live')));
const dep=await txt('#deploys');
ok('deployment history: commits with test results, the live one marked',/v1\.28: status page Live now/.test(dep)&&/Passed/.test(dep)&&/failure/.test(dep)&&(await p.$$('#deploys tr.islive')).length===1,dep);
ok('database: size against the free plan, counts, schema',/of the free plan’s 500 MB/.test(await txt('#dbSize'))&&/2-family\.sql v1\.25/.test(await txt('#dbSchema'))&&/5-status\.sql v1\.28/.test(await txt('#dbSchema')));
ok('no policy violations',(await p.evaluate(()=>window.__v)).length===0,(await p.evaluate(()=>window.__v)).join(' | '));
await p.screenshot({path:OUT+'status.png',fullPage:true});
// a failed latest check and a failing test run show up in the banner
sql(`insert into public.cradle_probes(at,done_at,code,ok) values (now(),now(),502,false)`);
RUNS.workflow_runs[0].conclusion='failure';
await p.click('#refresh');await p.waitForTimeout(1200);
ok('a failed check and failing tests: needs attention',/Some things need attention: Website, Tests on main/.test(await txt('#banner'))&&(await p.getAttribute('#banner','class')).includes('warn'),await txt('#banner'));
// the database part not set up: friendly notes
sql(`revoke execute on function public.cradle_status() from anon`);
await p.click('#refresh');await p.waitForTimeout(1200);
const nt=await txt('body');ok('without the database part, the page says what to run',/(Not set up|Not reachable)/.test(await txt('#components')));
sql(`grant execute on function public.cradle_status() to anon`);
// phone width: no sideways scrolling
await p.setViewportSize({width:390,height:844});await p.click('#refresh');await p.waitForTimeout(1200);
ok('fits a phone (no sideways scroll)',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
await p.screenshot({path:OUT+'status-phone.png',fullPage:true});
// the app still works and its service worker leaves /status/ alone
const sw=fs.readFileSync(new URL('./out/sites/status/sw.js',import.meta.url),'utf8');
ok('the app’s service worker skips /status/ and version.json',/\/status\//.test(sw)&&/version\.json/.test(sw));
console.log('errors',errs);await b.close();
