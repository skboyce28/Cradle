// Retakes the app screenshots used by README.md and docs/overview.html, with the made-up baby in
// tests/fixtures and a pretend signed-in family (nothing is sent anywhere).
//
//   cd tests && npm ci          (once, for Playwright)
//   node ../tools/screenshots/take.mjs     then     python3 ../tools/screenshots/to_webp.py
//
// Full-screen views that don't show the header (Night shift, Calm, Learning center cards, the
// sign-in screen) and the Daily Word picture are left as they are.
import { chromium } from '../../tests/node_modules/playwright/index.mjs';
import fs from 'fs';import path from 'path';import { fileURLToPath, pathToFileURL } from 'url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),out=path.join(repo,'tests/out/shots');
fs.mkdirSync(out,{recursive:true});
const APP=pathToFileURL(path.join(repo,'cradle.html')).href;
const DEMO=fs.readFileSync(path.join(repo,'tests/fixtures/demo-bath.json'),'utf8');
const FAM={household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[{user_id:'u1',email:'alex@example.com',role:'owner',me:true},{user_id:'u2',email:'sam@example.com',role:'member',me:false},{user_id:'u3',email:'grandma',role:'member',me:false}],invites:[]};
// Sleep on, with an Owlet Dream Sock: last night and a nap from the sock, one nap logged by hand, asleep now
const OWL_DEMO=(()=>{const D=JSON.parse(DEMO);D.settings.track=Object.assign({breast:true,bottle:true,pump:true},D.settings.track||{},{sleep:true});D.settings.owlet=true;
  // the week before: nights and most naps from the sock, a couple of naps logged by hand
  ['2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08'].forEach((k,i)=>{const d=D.days[k]||(D.days[k]={feeds:[],vitD:false,notes:''});
    d.feeds.push({id:'owA'+i,time:'00:10',end:'03:'+(20+i*4),sleep:true,mins:null,note:'',src:'owlet'},{id:'owB'+i,time:'03:50',end:'06:'+(30+i*3),sleep:true,mins:null,note:'',src:'owlet'},
      {id:'owC'+i,time:'09:'+(10+i*5),end:'10:'+(25+i*4),sleep:true,mins:null,note:'',src:'owlet'},{id:'slD'+i,time:'13:00',end:'14:'+(10+i*6),sleep:true,mins:null,note:i%2?'Stroller':'',},
      {id:'owE'+i,time:'16:20',end:'17:'+(15+i*5),sleep:true,mins:null,note:'',src:'owlet'},{id:'owF'+i,time:'20:'+(15+i*3),end:'23:'+(40+i*2),sleep:true,mins:null,note:'',src:'owlet'})});
  D.days['2026-10-09'].feeds.push({id:'owlN2',time:'04:30',end:'07:10',sleep:true,mins:160,note:'',src:'owlet'},{id:'slH1',time:'09:20',end:'10:05',sleep:true,mins:45,note:'Car seat',},{id:'owlP1',time:'11:15',end:'12:50',sleep:true,mins:95,note:'',src:'owlet'},{id:'owlP2',time:'14:06',end:'',sleep:true,mins:null,note:'',src:'owlet'});
  return JSON.stringify(D)})();
const OWL_STATUS={connected:true,sock:'Owlet Sock',account:'a•••@example.com',region:'world',state:'asleep',since:new Date('2026-10-09T14:06:00').toISOString(),battery:82,checked:new Date('2026-10-09T14:39:40').toISOString(),polled:null,problem:null,reconnect:false,by:'alex@example.com'};
const PICS={u1:{kind:'preset',preset:'bear'},u2:{kind:'preset',preset:'mom'}};
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:FAM,init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z',pic:{kind:'preset',preset:'bear',visibility:'family'},picOwner:'u1',fpics:PICS});
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});
async function phone(theme='light',opt={}){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:theme==='dark'?'dark':'light',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const u=r.request().url(),H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});
    const json=o=>r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify(o)});
    if(u.includes('/rpc/cradle_my_profile'))return json({kind:'preset',preset:'bear',visibility:'family'});
    if(u.includes('/rpc/cradle_family_pics'))return json(PICS);
    if(u.includes('/rpc/cradle_owlet_status'))return json(opt.owlet?OWL_STATUS:{connected:false});
    if(u.includes('/rpc/'))return json(Object.assign({claimed:false},FAM));
    if(r.request().method()==='GET')return json([]);
    return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(APP);
  const data=opt.owlet?OWL_DEMO:DEMO;
  await p.evaluate(([d,c,t])=>{localStorage.clear();const S=JSON.parse(d);S.settings.theme=t;delete S.achSeen;localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));localStorage.setItem('cradle-cloud-v1',c)},[data,CL,theme]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(400);
  await p.evaluate(()=>{document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'));window.print=()=>{}});
  await p.clock.runFor(4000);await p.waitForTimeout(200);// let any toast fade
  return p}
const closeAll=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const shot=(p,name)=>p.screenshot({path:path.join(out,name+'.png')});

// SHOTS=owlet retakes only the Owlet pictures
if(process.env.SHOTS==='owlet'){
  const o=await phone('light',{owlet:true});await o.clock.runFor(61000);await o.waitForTimeout(600);await closeAll(o);await shot(o,'owlet-log');
  await o.click('#menuBtn');await o.click('[data-act=settings]');await o.waitForTimeout(800);
  await o.evaluate(()=>document.getElementById('owlBox').scrollIntoView({block:'center'}));await o.waitForTimeout(300);await shot(o,'owlet-settings');
  await closeAll(o);await o.click('#tabs [data-tab=dash]');await o.clock.runFor(500);await o.click('#dashFilter [data-f=sleep]');await o.waitForTimeout(400);
  await o.evaluate(()=>{const k=document.querySelector('#kpis .kpi[data-cat=sleep]');scrollTo(0,k.getBoundingClientRect().top+scrollY-12)});await o.waitForTimeout(300);await shot(o,'owlet-dash');
  await o.evaluate(()=>{const c=document.getElementById('chart7').closest('.card');scrollTo(0,c.getBoundingClientRect().top+scrollY-12)});await o.waitForTimeout(300);await shot(o,'owlet-chart');
  await b.close();console.log('screenshots in',out);process.exit(0)}
let p=await phone();
await shot(p,'log');
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(500);await p.waitForTimeout(300);await shot(p,'dash');
await p.click('.xbtn[data-chart=c1]');await p.clock.runFor(400);await p.waitForTimeout(300);
const hits=await p.$$('#cmChart .hit');if(hits[2])await hits[2].click();await p.waitForTimeout(300);await shot(p,'zoom');
await p.keyboard.press('Escape');
for(const [c,n] of [['c4','rhythm'],['c2','volume'],['c3','diapers']]){await closeAll(p);await p.click(`.xbtn[data-chart=${c}]`);await p.clock.runFor(400);await p.waitForTimeout(300);await shot(p,n);await p.keyboard.press('Escape')}
await closeAll(p);await p.click('#tabs [data-tab=hist]');await p.clock.runFor(500);await p.waitForTimeout(300);await shot(p,'hist');
await p.click('#tabs [data-tab=today]');await p.clock.runFor(300);
await p.click('#addBath');await p.clock.runFor(400);
await p.click('.feed.bathrow .bseg button:nth-child(2)');await p.fill('.feed.bathrow input[type=text], .feed.bathrow textarea, .feed.bathrow .c-note input','Hair wash').catch(()=>{});await p.evaluate(()=>document.activeElement&&document.activeElement.blur());await p.clock.runFor(4000);
await p.evaluate(()=>{const r=document.querySelector('.feed.bathrow');if(r){const y=r.getBoundingClientRect().top+scrollY-window.innerHeight*0.55;scrollTo(0,y)}});await p.waitForTimeout(300);await shot(p,'bath');
await p.evaluate(()=>scrollTo(0,0));await p.click('#menuBtn');await p.click('[data-act=family]');await p.clock.runFor(800);await p.waitForTimeout(500);await shot(p,'family');
await closeAll(p);await p.click('#menuBtn');await p.click('[data-act=ach]');await p.waitForTimeout(400);await shot(p,'ach');
// Fun center: a Bottle Catch round and a Stork Flight, mid-game
await p.keyboard.press('Escape');await closeAll(p);
await p.click('#menuBtn');await p.click('[data-act=fun]');await p.click('#funPlay');await p.click('#gPanel [data-g=play]');
await p.mouse.move(195,600);await p.mouse.down();for(let i=0;i<14;i++){await p.clock.runFor(500);await p.mouse.move(120+((i*53)%160),600)}
await p.mouse.up();await shot(p,'bottle');
await p.evaluate(()=>{document.getElementById('game').classList.remove('open')});await p.keyboard.press('Escape').catch(()=>{});
const q0=await phone();await q0.click('#menuBtn');await q0.click('[data-act=fun]');await q0.click('#funStorkPlay');await q0.click('#skPanel [data-s=play]');
for(let i=0;i<6;i++){await q0.mouse.click(195,420);await q0.clock.runFor(660)}
await q0.mouse.click(195,420);await q0.clock.runFor(200);await shot(q0,'stork');await q0.context().close();
for(const t of ['dark','dalmatian','halloween','thanksgiving','christmas']){const q=await phone(t);await q.clock.runFor(1500);await q.waitForTimeout(500);await shot(q,'log-'+t);await q.context().close()}
await b.close();console.log('screenshots in',out);
