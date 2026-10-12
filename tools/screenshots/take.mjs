// Retakes the app screenshots used by README.md and docs/overview.html, with the made-up baby in
// tests/fixtures and a pretend signed-in family (nothing is sent anywhere).
//
//   cd tests && npm ci          (once, for Playwright)
//   node ../tools/screenshots/take.mjs     then     python3 ../tools/screenshots/to_webp.py
//
// Full-screen views that don't show the header (Night shift, Calm, Learning center cards, the
// sign-in screen) and the Daily Word and Achievements pictures are left as they are.
import { chromium } from '../../tests/node_modules/playwright/index.mjs';
import fs from 'fs';import path from 'path';import { fileURLToPath, pathToFileURL } from 'url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),out=path.join(repo,'tests/out/shots');
fs.mkdirSync(out,{recursive:true});
const APP=pathToFileURL(path.join(repo,'cradle.html')).href;
const DEMO=fs.readFileSync(path.join(repo,'tests/fixtures/demo-bath.json'),'utf8');
const FAM={household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[{user_id:'u1',email:'alex@example.com',role:'owner',me:true},{user_id:'u2',email:'sam@example.com',role:'member',me:false},{user_id:'u3',email:'grandma',role:'member',me:false}],invites:[]};
const PICS={u1:{kind:'preset',preset:'bear'},u2:{kind:'preset',preset:'mom'}};
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:FAM,init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z',pic:{kind:'preset',preset:'bear',visibility:'family'},picOwner:'u1',fpics:PICS});
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});
async function phone(theme='light'){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:theme==='dark'?'dark':'light',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const u=r.request().url(),H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});
    const json=o=>r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify(o)});
    if(u.includes('/rpc/cradle_my_profile'))return json({kind:'preset',preset:'bear',visibility:'family'});
    if(u.includes('/rpc/cradle_family_pics'))return json(PICS);
    if(u.includes('/rpc/'))return json(Object.assign({claimed:false},FAM));
    if(r.request().method()==='GET')return json([]);
    return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(APP);
  await p.evaluate(([d,c,t])=>{localStorage.clear();const S=JSON.parse(d);S.settings.theme=t;delete S.achSeen;localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));localStorage.setItem('cradle-cloud-v1',c)},[DEMO,CL,theme]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(400);
  await p.evaluate(()=>{document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'));window.print=()=>{}});
  await p.clock.runFor(4000);await p.waitForTimeout(200);// let any toast fade
  return p}
const shot=(p,name)=>p.screenshot({path:path.join(out,name+'.png')});

let p=await phone();
await shot(p,'log');
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(500);await p.waitForTimeout(300);await shot(p,'dash');
await p.click('.xbtn[data-chart=c1]');await p.clock.runFor(400);await p.waitForTimeout(300);
const hits=await p.$$('#cmChart .hit');if(hits[2])await hits[2].click();await p.waitForTimeout(300);await shot(p,'zoom');
await p.keyboard.press('Escape');await p.click('#tabs [data-tab=hist]');await p.clock.runFor(500);await p.waitForTimeout(300);await shot(p,'hist');
await p.click('#tabs [data-tab=today]');await p.clock.runFor(300);
await p.click('#addBath');await p.clock.runFor(400);
await p.click('.feed.bathrow .bseg button:nth-child(2)');await p.fill('.feed.bathrow input[type=text], .feed.bathrow textarea, .feed.bathrow .c-note input','Hair wash').catch(()=>{});await p.evaluate(()=>document.activeElement&&document.activeElement.blur());await p.clock.runFor(4000);
await p.evaluate(()=>{const r=document.querySelector('.feed.bathrow');if(r){const y=r.getBoundingClientRect().top+scrollY-window.innerHeight*0.55;scrollTo(0,y)}});await p.waitForTimeout(300);await shot(p,'bath');
await p.evaluate(()=>scrollTo(0,0));await p.click('#menuBtn');await p.click('[data-act=family]');await p.clock.runFor(800);await p.waitForTimeout(500);await shot(p,'family');
for(const t of ['dark','dalmatian','halloween','thanksgiving','christmas']){const q=await phone(t);await q.clock.runFor(1500);await q.waitForTimeout(500);await shot(q,'log-'+t);await q.context().close()}
await b.close();console.log('screenshots in',out);
