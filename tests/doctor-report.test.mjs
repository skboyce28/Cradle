import { chromium } from 'playwright';import fs from 'fs';const require_fs=fs;
const DEMO=fs.readFileSync(new URL('./fixtures/report-audit.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const FAM={household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[{user_id:'u1',email:'alex@example.com',role:'owner',me:true},{user_id:'u2',email:'sam@example.com',role:'member',me:false},{user_id:'u3',email:'grandma',role:'member',me:false}],invites:[]};
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:FAM,init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone({theme='light',signedIn=true,demo=true,w=390,h=844}={}){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,colorScheme:theme==='dark'?'dark':'light',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const u=r.request().url();const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});
    if(u.includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify(Object.assign({claimed:false},FAM))});
    if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});
    return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c,theme,si])=>{localStorage.clear();if(!d)return;const S=JSON.parse(d);S.settings.theme=theme;localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));if(si)localStorage.setItem('cradle-cloud-v1',c)},[demo?DEMO:'',CL,theme,signedIn]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(400);
  return p}

await (async()=>{
const p=await phone({theme:'light'});
await p.evaluate(()=>{window.print=()=>{}});
await p.click('#tabs [data-tab=dash]');await p.waitForTimeout(300);
await p.click('[data-report]');await p.waitForTimeout(500);
const out=await p.evaluate(()=>{const r=document.getElementById('print');return {text:r.innerText,rows:[...r.querySelectorAll('table')[0].rows].map(tr=>[...tr.cells].map(c=>c.innerText.trim()))}});
require_fs.writeFileSync((process.env.CRADLE_OUT||'out')+'/report.json',JSON.stringify(out));
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/doctor-report.png'});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const t=out.text,rows=out.rows.slice(1);
// recompute every daily row from the log, independently of the app's code
const D=JSON.parse(DEMO),num=v=>v==null||v===''||isNaN(+v)?null:+v;
const isFeed=f=>!f.bath&&!!(f.wf||f.left||f.right||num(f.bottle)!=null||num(f.pump)!=null||(num(f.mins)||0)>0);
const lab=k=>new Date(k+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
const bad=[];
for(const r of rows){const label=r[0].replace(' (so far)','');const k=Object.keys(D.days).find(k=>lab(k)===label);const fs=k?D.days[k].feeds:[];const feeds=fs.filter(isFeed);
  const mins=feeds.reduce((a,f)=>a+(num(f.mins)||0),0),bot=fs.reduce((a,f)=>a+(num(f.bottle)||0),0),pump=fs.reduce((a,f)=>a+(num(f.pump)||0),0),hasP=fs.some(f=>num(f.pump)!=null);
  const exp=[String(feeds.length),mins?String(mins):'',String(Math.round(bot)),hasP?String(Math.round(pump)):'',fs.filter(f=>f.urine).length+' / ',fs.filter(f=>f.stool).length+' / '];
  const got=[r[2],r[3],r[4],r[5],r[6].slice(0,exp[4].length),r[7].slice(0,exp[5].length)];
  if(JSON.stringify(exp)!==JSON.stringify(got))bad.push(label+': expected '+exp.join(',')+' got '+got.join(','))}
ok('every daily row matches the log',bad.length===0,bad.slice(0,2).join(' | ')||rows.length+' rows');
ok('pumping averaged over the days you pumped','Pumped: 365 mL/day (on 8 days with pumping)'.split(' ').every(w=>t.includes(w))&&t.includes('Pumped: 365 mL/day (on 8 days with pumping)'),(t.match(/Pumped:[^·]*/)||[''])[0]);
ok('Vitamin D only counts days since its start date',t.includes('Vitamin D: 9 of 9 days'),(t.match(/Vitamin D:[^·]*/)||[''])[0]);
ok('no rows before the birth date',rows.every(r=>!/Sep 26/.test(r[0]))&&/Sep 27/.test(rows[0][0]),rows[0][0]);
ok('nursing says how many feeds were timed',t.includes('timed on 94 of 97 nursing feeds'));
ok('averages: feeds, bottle, wet, stool',['Feeds/day: 8.1','Bottle: 218 mL/day','Wet/day: 4.9','Stool/day: 3.9'].every(x=>t.includes(x)));
ok('baths counted, with the last one',t.includes('Baths: 4, last'));
})();
console.log('errors',errs);await b.close();
