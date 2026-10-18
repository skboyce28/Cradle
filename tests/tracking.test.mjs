import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-full.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone({w=390,h=844,data=DEMO}={}){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,acceptDownloads:true,permissions:['clipboard-read','clipboard-write'],...(w<600?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'}:{})});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();if(d){const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S))}localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>window.print=()=>{});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+extra:''));


const shown=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const cs=getComputedStyle(e);return e.offsetParent!==null&&cs.visibility!=='hidden'&&cs.display!=='none'},sel);
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
async function setTrack(p,{breast,bottle,pump}){await closeModals(p);await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
  for(const [id,v] of [['#sTrBreast',breast],['#sTrBottle',bottle],['#sTrPump',pump]])await p.setChecked(id,v);await p.click('#sSave');await p.waitForTimeout(300);await closeModals(p)}
const report=async p=>{await p.click('#tabs [data-tab=dash]');await p.click('[data-report]');await p.waitForTimeout(400);const t=await p.evaluate(()=>{const r=document.getElementById('print');const vis=el=>getComputedStyle(el).display!=='none';
  return {heads:[...r.querySelectorAll('table')[0].rows[0].cells].filter(vis).map(c=>c.innerText.trim()),avg:[...r.querySelectorAll('span')].filter(vis).map(x=>x.innerText).join('|')+r.innerText}});await p.evaluate(()=>document.body.classList.remove('print-sheet'));await p.waitForTimeout(800);await closeModals(p);return t};

let p=await phone();
ok('everything shows by default',await shown(p,'.feed .c-bottle')&&await shown(p,'.feed .c-pump')&&await shown(p,'.feed .c-side')&&await shown(p,'[data-track=pump] h3'));
// --- breast only ---
await setTrack(p,{breast:true,bottle:false,pump:false});
ok('saved for the family (shared setting)',JSON.stringify((await S(p)).settings.track)==='{"breast":true,"bottle":false,"pump":false,"tummy":true,"sleep":false}');
ok('Log: bottle and pump boxes hidden, breast kept',!(await shown(p,'.feed .c-bottle'))&&!(await shown(p,'.feed .c-pump'))&&await shown(p,'.feed .c-side')&&await shown(p,'.feed .c-min'));
ok('pump timer and bottle/pumped tiles hidden',!(await shown(p,'.card[data-track=pump] .timer'))&&!(await shown(p,'#stats [data-track=bottle]'))&&!(await shown(p,'#stats [data-track=pump]')));
await p.screenshot({path:OUT+'track-breast-log.png'});
await p.click('#tabs [data-tab=dash]');await p.waitForTimeout(300);
const kp=await p.$$eval('#kpis .kpi',ks=>ks.filter(k=>getComputedStyle(k).display!=='none').map(k=>k.querySelector('h3').textContent));
ok('Dashboard: no bottle or pump tiles',!kp.some(k=>/Bottle|Pumped/.test(k))&&kp.includes('Side starts'),kp.join(', '));
ok('Dashboard: daily volume chart and Bottle & pump chip hidden',!(await shown(p,'#chart2'))&&!(await shown(p,'#dashFilter [data-f=bottle]')));
const ins=await p.$$eval('#insights li span:first-child',s=>s.map(x=>x.textContent));ok('no bottle or pump insights',!ins.some(x=>['🍼','⚡','📈','📉'].includes(x))&&ins.includes('⏱'),ins.join(''));
const r1=await report(p);ok('doctor report: no Bottle or Pump columns, Nursing kept',!r1.heads.includes('Bottle mL')&&!r1.heads.includes('Pump mL')&&r1.heads.includes('Nursing min'),r1.heads.join(','));
await p.click('#tabs [data-tab=today]');await p.click('#nightBtn');await p.waitForTimeout(300);await p.click('#night [data-n=start]').catch(()=>{});await p.waitForTimeout(300);
ok('Night shift: breast and timer, no bottle',await shown(p,'#night [data-n=L]')&&await shown(p,'#nTimer')&&!(await shown(p,'#night .nml')));
await p.keyboard.press('Escape');await p.waitForTimeout(200);
// --- bottle only ---
await setTrack(p,{breast:false,bottle:true,pump:false});
ok('Log: breast and minutes hidden, bottle kept',!(await shown(p,'.feed .c-side'))&&!(await shown(p,'.feed .c-min'))&&await shown(p,'.feed .c-bottle')&&!(await shown(p,'.feed .chk.wf')));
await p.screenshot({path:OUT+'track-bottle-log.png'});
await p.click('#tabs [data-tab=dash]');await p.waitForTimeout(300);
ok('Dashboard: side balance and Side starts hidden',!(await shown(p,'#sideBal'))&&!(await p.$$eval('#kpis .kpi',ks=>ks.some(k=>getComputedStyle(k).display!=='none'&&/Side starts/.test(k.textContent)))));
const r2=await report(p);ok('doctor report: no Nursing column; Bottle kept',!r2.heads.includes('Nursing min')&&r2.heads.includes('Bottle mL'),r2.heads.join(','));
await p.click('#tabs [data-tab=today]');
await p.click('#nightBtn');await p.waitForTimeout(300);
if(await p.isVisible('#night [data-n=done]')){await p.click('#night [data-n=done]');await p.waitForTimeout(300)}
if(await p.isVisible('#night [data-n=start]')){await p.click('#night [data-n=start]');await p.waitForTimeout(300)}
ok('Night shift: Start feed doesn’t start a nursing timer; bottle shown, breast hidden',!(await S(p)).nurse&&await shown(p,'#night .nml')&&!(await shown(p,'#night [data-n=L]')),JSON.stringify((await S(p)).nurse));
await p.keyboard.press('Escape');await p.waitForTimeout(200);
// --- none ---
await closeModals(p);await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
for(const id of ['#sTrBreast','#sTrBottle','#sTrPump'])await p.setChecked(id,false);await p.click('#sSave');await p.waitForTimeout(200);
ok('can’t turn all three off',/Track at least one/.test(await txt(p,'#toast'))&&(await S(p)).settings.track.bottle===true);
await closeModals(p);
// --- export carries it ---
await setTrack(p,{breast:true,bottle:true,pump:false});
await p.click('#menuBtn');await p.click('[data-act=data]');await p.click('[data-dm=export]');await p.waitForTimeout(300);
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('text=Download file')]);const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
ok('export includes the setting',JSON.stringify(ex.settings.track)==='{"breast":true,"bottle":true,"pump":false,"tummy":true,"sleep":false}',JSON.stringify(ex.settings.track));
await closeModals(p);
await setTrack(p,{breast:true,bottle:true,pump:true});
ok('turning everything back on restores it',await shown(p,'.feed .c-pump')&&await shown(p,'.card[data-track=pump] .timer'));
// --- desktop: columns stay lined up ---
const d=await phone({w:1280,h:800});await setTrack(d,{breast:false,bottle:true,pump:true});
const al=await d.evaluate(()=>{const h=document.querySelector('.cols .h-bot').getBoundingClientRect(),c=document.querySelector('.feed .c-bottle').getBoundingClientRect(),hp=document.querySelector('.cols .h-pump').getBoundingClientRect(),cp=document.querySelector('.feed .c-pump').getBoundingClientRect();return [Math.round(h.left-c.left),Math.round(hp.left-cp.left),Math.round(c.left)]});
ok('desktop: headers stay over their columns',Math.abs(al[0])<=1&&Math.abs(al[1])<=1,JSON.stringify(al));
await d.screenshot({path:OUT+'track-desktop.png'});
const sw=await p.evaluate(()=>document.documentElement.scrollWidth);ok('no sideways scroll on phone',sw<=390,String(sw));
console.log('errors',errs);await b.close();
