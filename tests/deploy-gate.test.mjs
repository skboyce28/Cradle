// Deploys wait for tests (tools/netlify_ignore.py) and the outside check (tools/monitor.py), run
// against a stand-in GitHub API, the built status site on :8097, and the Supabase stand-in.
import http from 'http';import { spawn, execSync } from 'child_process';import path from 'path';import { fileURLToPath } from 'url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'..');
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+String(x).replace(/\s+/g,' ').slice(0,300):''));
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const LIVE='a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',NEWER='ffffffffffffffffffffffffffffffffffffffff';
// stand-in GitHub: check runs per commit, and main's newest commit
const gh={runs:{},head:LIVE,down:false};
const srv=http.createServer((req,res)=>{if(gh.down){res.writeHead(500);return res.end('down')}
  const u=new URL(req.url,'http://x');let m;
  if((m=u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)\/check-runs$/))){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({check_runs:gh.runs[m[1]]||[]}))}
  if(/^\/repos\/[^/]+\/[^/]+\/commits\/main$/.test(u.pathname)){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({sha:gh.head}))}
  res.writeHead(404);res.end('{}')});
await new Promise(r=>srv.listen(8096,r));
const API='http://localhost:8096';
// spawn (not spawnSync): the stand-in GitHub above runs in this same process and must keep answering
const run=(script,env)=>new Promise(res=>{const p=spawn('python3',[path.join(repo,'tools',script)],{env:{PATH:process.env.PATH,CRADLE_GITHUB_API:API,...env}});let out='';
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);const t=setTimeout(()=>p.kill(),60000);p.on('close',code=>{clearTimeout(t);res({code,out})})});
const ign=env=>run('netlify_ignore.py',{REPOSITORY_URL:'https://github.com/skboyce28/Cradle',CONTEXT:'production',COMMIT_REF:LIVE,...env});
const iso=m=>new Date(Date.now()-m*60e3).toISOString();

// --- Netlify ignore: 1 builds, 0 skips
gh.runs[LIVE]=[{name:'test',status:'in_progress',conclusion:null}];
let r=await ign();ok('push while the tests are still running: Netlify skips the build',r.code===0&&/in_progress; skipping/.test(r.out),r.out.trim());
gh.runs[LIVE]=[{name:'test',status:'completed',conclusion:'failure'}];
r=await ign();ok('tests failed: skipped, so the last good version stays live',r.code===0&&/failure; skipping/.test(r.out),r.out.trim());
gh.runs[LIVE]=[{name:'test',status:'completed',conclusion:'failure'},{name:'test',status:'completed',conclusion:'success',completed_at:iso(5)}];
r=await ign();ok('tests passed (a rerun counts): builds',r.code===1&&/tests passed/.test(r.out),r.out.trim());
gh.runs[LIVE]=[];r=await ign();ok('no test run yet: skipped',r.code===0&&/not started/.test(r.out),r.out.trim());
gh.down=true;r=await ign();gh.down=false;ok('GitHub not answering: skipped (the tests start the deploy instead)',r.code===0&&/could not ask GitHub/.test(r.out),r.out.trim());
r=await ign({CONTEXT:'deploy-preview'});ok('deploy previews build as usual',r.code===1);
r=await ign({COMMIT_REF:''});ok('nothing to check: builds as usual',r.code===1);

// --- the outside check against the built status site
const SITE='http://localhost:8097';
sql(`delete from cron.job_run_details; delete from cron.job; delete from public.cradle_probes; delete from public.cradle_owlet`);
sql(`select cradle_status_set_site('https://cradle-test.netlify.app')`);
sql(`insert into public.cradle_probes(at,done_at,code,ok,ms) values (now()-interval '4 minutes',now(),200,true,150)`);
sql(`insert into cron.job(jobname) values ('cradle-notify')`);
sql(`insert into cron.job_run_details(jobid,status,start_time) select (select jobid from cron.job where jobname='cradle-notify'),'succeeded',now()-g*interval '1 min' from generate_series(1,50) g`);
const mon=env=>run('monitor.py',{CRADLE_SITE_URL:SITE,CRADLE_GITHUB_REPO:'skboyce28/Cradle',...env});
gh.head=LIVE;r=await mon();
ok('healthy: every check passes',r.code===0&&/All 6 checks passed/.test(r.out)&&/PASS  Database answers/.test(r.out)&&/PASS  Uptime checks running/.test(r.out)&&/PASS  Notification job \| 50 of 50/.test(r.out)&&/main a1b2c3d is live/.test(r.out),r.out);
// a newer commit that passed its tests an hour ago but never went live
gh.head=NEWER;gh.runs[NEWER]=[{name:'test',status:'completed',conclusion:'success',completed_at:iso(60)}];
r=await mon();ok('a tested commit stuck for an hour: fails',r.code===1&&/FAIL  Deploy up to date \| main fffffff passed its tests 60 min ago/.test(r.out),r.out.split('\n').filter(l=>/Deploy/.test(l)).join(' '));
gh.runs[NEWER]=[{name:'test',status:'completed',conclusion:'failure'}];
r=await mon();ok('a newer commit that failed its tests: fine, the old version stays live on purpose',r.code===0&&/as designed/.test(r.out));
gh.head=LIVE;
// the uptime checks inside Supabase stopped
sql(`update public.cradle_probes set at=now()-interval '2 hours'`);
r=await mon();ok('uptime checks stopped: fails',r.code===1&&/FAIL  Uptime checks running \| last check 120 min ago/.test(r.out),r.out.split('\n').filter(l=>/Uptime/.test(l)).join(' '));
sql(`insert into public.cradle_probes(at,done_at,code,ok,ms) values (now(),now(),200,true,150)`);
// the notification job failing
sql(`insert into cron.job_run_details(jobid,status,start_time) select (select jobid from cron.job where jobname='cradle-notify'),'failed',now()-g*interval '1 min' from generate_series(1,20) g`);
r=await mon();ok('notification job failing: fails',r.code===1&&/FAIL  Notification job \| 50 of 70/.test(r.out));
sql(`delete from cron.job_run_details where status='failed'`);
// an Owlet sock that stopped being read, then fine again
{const hh=sql(`select id from cradle_households limit 1`);sql(`insert into public.cradle_owlet(household_id,dsn,enc_refresh,ok_at) values ('${hh}','AC0','v1:x',now()-interval '30 minutes')`);
  r=await mon();ok('Owlet sock not read for 30 min and no schedule: fails',r.code===1&&/FAIL  Owlet checks \| schedule missing .*1 not read in 10\+ min/.test(r.out),r.out.split('\n').filter(l=>/Owlet/.test(l)).join(' '));
  sql(`insert into cron.job(jobname) values ('cradle-owlet'); update public.cradle_owlet set ok_at=now()`);
  r=await mon();ok('…and passes once it’s scheduled and reading',r.code===0&&/PASS  Owlet checks \| 1 connected, last reading 0 min ago/.test(r.out),r.out.split('\n').filter(l=>/Owlet/.test(l)).join(' '));
  sql(`delete from public.cradle_owlet; delete from cron.job where jobname='cradle-owlet'`)}
// the site is down
r=await mon({CRADLE_SITE_URL:'http://localhost:8095'});ok('site down: fails',r.code===1&&/FAIL  Site loads/.test(r.out));
r=await mon({CRADLE_SITE_URL:''});ok('no address set: says how to set it',r.code===2&&/Set CRADLE_SITE_URL/.test(r.out));
srv.close();console.log('errors',[]);
