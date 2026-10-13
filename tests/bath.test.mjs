import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-bath.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone({w=390,h=844,data=DEMO}={}){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();if(d){const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S))}localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>window.print=()=>{});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+extra:''));

let p=await phone();
const before=await txt(p,'#stats');const sinceB=await txt(p,'#sinceVal');const dueB=await txt(p,'#dueLine');
await p.click('#addBath');await p.clock.runFor(400);
let s=await S(p);const tb=s.days['2026-10-09'].feeds.filter(f=>f.bath);
ok('Bath button adds a bath row',tb.length===1&&tb[0].bath==='sponge'&&tb[0].time==='14:40',JSON.stringify(tb[0]));
ok('row shows 🛁 and Sponge selected',await p.isVisible('.feed.bathrow')&&(await txt(p,'.feed.bathrow .bseg button.on'))==='Sponge');
ok('toast confirms',/Sponge bath logged at 2:40pm/i.test(await txt(p,'#toast')),await txt(p,'#toast'));
const after=await txt(p,'#stats');
ok('feed count unchanged',before.match(/Feeds (\d+)/i)[1]===after.match(/Feeds (\d+)/i)[1],'feeds '+after.match(/Feeds (\d+)/i)[1]);
ok('since-last-feed and next-feed unchanged',sinceB===await txt(p,'#sinceVal')&&dueB===await txt(p,'#dueLine'));
ok('Bath tile shows today',/Bath 🛁 Sponge 2:40pm/i.test(after),after.match(/Bath[^V]*/i)[0]);
await p.screenshot({path:OUT+'b-log.png'});
await p.click('.feed.bathrow [data-bath=tub]');await p.clock.runFor(200);s=await S(p);
ok('switch to Tub saves',s.days['2026-10-09'].feeds.find(f=>f.bath).bath==='tub'&&s.ui.lastBath==='tub');
await p.fill('.feed.bathrow input[data-k=note]','Hair wash');await p.clock.runFor(300);s=await S(p);
ok('note saves',s.days['2026-10-09'].feeds.find(f=>f.bath).note==='Hair wash');
await p.click('.feed.bathrow .del');await p.waitForTimeout(200);ok('delete asks about a bath',(await txt(p,'#askMsg'))==='Delete this bath?');await p.click('#askOk');await p.clock.runFor(300);
s=await S(p);ok('bath deleted',!s.days['2026-10-09'].feeds.some(f=>f.bath));
await p.click('#addBath');await p.clock.runFor(300);s=await S(p);ok('next bath defaults to last kind (Tub)',s.days['2026-10-09'].feeds.find(f=>f.bath).bath==='tub');

// Dashboard
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(400);
const k=await txt(p,'#kpis');ok('Dashboard Baths tile',/Baths 3 in 7 days Last Fri, Oct 9 \(today\)\. 1 sponge, 2 tub/i.test(k),k.match(/Baths.*?(?=Side starts)/i)?.[0]);
ok('Feeds per day ignores baths',/Feeds per day 8\.2/i.test(k),k.match(/Feeds per day [\d.]+/i)?.[0]);
const ins=await txt(p,'#insights');ok('Bath insight',/🛁 3 baths in these 7 days\. Last: tub bath on Fri, Oct 9 at 2:4\dpm \(today\)\./i.test(ins),ins.match(/🛁[^.]*\.[^.]*\./i)?.[0]);
await p.screenshot({path:OUT+'b-dash.png'});
await p.click('.chartbox >> nth=0').catch(()=>{});await p.clock.runFor(300);
// explore by day chart (diapers chart is per day): open the diapers chart and select Oct 7
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
await p.click('.chartbox >> nth=2');await p.clock.runFor(300);
const tbl=await p.innerText('#cmTable').catch(()=>'');ok('chart table has Bath column with Oct 7 tub',/Bath/i.test(tbl)&&/Tub 7:00pm/i.test(tbl));
await p.click('#cmTable tr[data-sel="2026-10-07"]').catch(()=>{});await p.clock.runFor(200);
ok('day detail shows Bath',/Bath Tub 7:00pm/i.test(await txt(p,'#cmSel')),(await txt(p,'#cmSel')).match(/Bath.{0,20}/i)?.[0]);
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
// Doctor report
await p.click('[data-report]');await p.clock.runFor(1000);const rep=(await p.evaluate(()=>{const c=document.getElementById('print').cloneNode(true);c.querySelectorAll('th,td').forEach(e=>e.append(' '));return c.textContent})).replace(/\s+/g,' ');await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
ok('doctor report: baths line',/Baths: ?3, last Fri, Oct 9 \(tub bath\)/i.test(rep),rep.match(/Baths:.{0,50}/i)?.[0]);
ok('doctor report: Bath column',/Vit D Bath Tummy min Longest gap/i.test(rep)&&/Tub/i.test(rep));
// History
await p.click('#tabs [data-tab=hist]');await p.clock.runFor(300);
const hc=await txt(p,'#histBody');ok('History card tag',/🛁 Tub 7:00pm/i.test(hc)&&/🛁 Sponge 10:15am/i.test(hc));
await p.screenshot({path:OUT+'b-hist.png'});
await p.click('#histSeg [data-v=table]');await p.clock.runFor(200);const ht=await txt(p,'#histBody');ok('History table Bath column',/Vit D Bath Tummy Longest gap/i.test(ht)&&/Tub 7:00pm/i.test(ht));
await p.click('#histSeg [data-v=cards]');
// Log print sheet for Oct 7
await p.click('#histBody [data-k="2026-10-07"]');await p.clock.runFor(300);
await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Print sheet/i.test(x.textContent));b&&b.click()});await p.clock.runFor(1000);await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const ps=(await p.evaluate(()=>[...document.querySelectorAll('#print td,#print p')].map(e=>e.textContent).join(' '))).replace(/\s+/g,' ');ok('print sheet shows bath row',/7:00pm 🛁 Tub bath Cord came off/i.test(ps)&&/Bath: Tub 7:00pm/i.test(ps),ps.match(/7:00pm 🛁.{0,40}/i)?.[0]);
ok('Oct 7 log row labeled 🛁',(await txt(p,'.feed.bathrow .n'))==='🛁');
// Night shift
await p.click('#tabs [data-tab=today]');await p.click('#todayBtn').catch(()=>{});await p.clock.runFor(200);
await p.evaluate(()=>{const S=JSON.parse(localStorage.getItem('cradle-feeding-v1'));});
await p.clock.runFor(2*3600e3);// 2h later: no recent feed so Night shift opens idle
await p.click('#nightBtn');await p.clock.runFor(500);
ok('Night shift idle has Bath button',await p.isVisible('#night [data-n=bath]'));await p.screenshot({path:OUT+'b-night.png'});
await p.click('#night [data-n=bath]');await p.clock.runFor(300);s=await S(p);
ok('Night shift logs a bath',s.days['2026-10-09'].feeds.filter(f=>f.bath).length===2,await txt(p,'#toast'));
ok('Night shift stays on start screen',await p.isVisible('#night [data-n=start]'));
await p.click('#night [data-n=exit2]');
// Export file, then import into an empty phone (Replace + Merge)
await p.click('#menuBtn');await p.click('[data-act=data]');await p.click('[data-dm=export]');await p.clock.runFor(300);
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('text=Download file')]);const file=await dl.path();
const ex=JSON.parse(fs.readFileSync(file,'utf8'));const exB=Object.values(ex.days).flatMap(d=>d.feeds.filter(f=>f.bath));
ok('export file keeps baths',exB.length===5&&exB.some(f=>f.bath==='tub'&&f.note==='Cord came off, first tub bath'),exB.length+' baths');
await p.click('#menuBtn').catch(()=>{});await p.keyboard.press('Escape');
await p.click('#menuBtn');await p.click('[data-act=data]');await p.click('[data-dm=export]');await p.clock.runFor(300);await p.click('#expCopy');await p.clock.runFor(800);
const code=await p.evaluate(()=>navigator.clipboard.readText());ok('text code made',code.includes('CRADLE1:'));
const q=await phone({data:JSON.stringify({settings:{theme:'light',v2:1},baseVersion:99,days:{}})});
await q.setInputFiles('#fileIn',file);await q.clock.runFor(500);await q.click('#impReplace');await q.click('#askOk');await q.clock.runFor(500);
let s2=await S(q);const imB=Object.values(s2.days).flatMap(d=>d.feeds.filter(f=>f.bath));
ok('file import (Replace) keeps baths and kinds',imB.length===5&&imB.filter(f=>f.bath==='tub').length===exB.filter(f=>f.bath==='tub').length&&imB.every(f=>!('left' in f)));
await q.setInputFiles('#fileIn',file);await q.clock.runFor(500);await q.click('#impMerge');await q.clock.runFor(500);s2=await S(q);
ok('merging same file again adds no duplicates',Object.values(s2.days).flatMap(d=>d.feeds.filter(f=>f.bath)).length===5);
const r=await phone({data:JSON.stringify({settings:{theme:'light',v2:1},baseVersion:99,days:{}})});
await r.click('#menuBtn');await r.click('[data-act=data]');await r.click('[data-dm=import]');await r.clock.runFor(200);await r.fill('#pasteIn',code);
await r.evaluate(()=>{const b=[...document.querySelectorAll('#importChoose button')].find(x=>/paste|import|continue|read/i.test(x.textContent)&&!/choose|cancel/i.test(x.textContent));b&&b.click()});await r.clock.runFor(800);
await r.click('#impReplace').catch(()=>{});await r.click('#askOk').catch(()=>{});await r.clock.runFor(500);
const s3=await S(r);ok('text code import keeps baths',Object.values(s3.days).flatMap(d=>d.feeds.filter(f=>f.bath)).length===5);
// phone layout of a bath row
const m=await phone({w:360});await m.click('#addBath');await m.clock.runFor(300);await m.evaluate(()=>document.querySelector('.feed.bathrow').scrollIntoView({block:'center'}));await m.screenshot({path:OUT+'b-mobile.png'});
ok('no sideways scroll on phone',!(await m.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
const dsk=await phone({w:1280,h:900});await dsk.click('#addBath');await dsk.clock.runFor(300);await dsk.evaluate(()=>document.querySelector('.feed.bathrow').scrollIntoView({block:'center'}));await dsk.screenshot({path:OUT+'b-desktop.png'});
console.log('errors',errs);await b.close();
