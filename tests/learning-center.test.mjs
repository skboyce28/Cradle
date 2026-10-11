import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-bath.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
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


let p=await phone();
// alarm card
const due=await txt(p,'#dueLine');ok('Set alarm button on the phone',await p.isVisible('#phoneAlarm')&&/Set alarm/i.test(await txt(p,'#phoneAlarm')),due);
await p.click('#phoneAlarm');await p.clock.runFor(300);
const as=await txt(p,'#alarmSetModal');ok('alarm card shows the time and steps',/Set an alarm on your phone for 4:55 PM Next feed for Juniper · in 2h 15m Open Clock Tap \+ Pick 4:55pm Done/i.test(as),as);
ok('no disclaimer text',!/doesn.t let|web apps/i.test(as));
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/l-alarm.png'});await p.click('#alarmSetModal [data-close]');
// learning center
await p.click('#menuBtn');ok('menu has Learning center',/Learning center/.test(await txt(p,'#dd')));
await p.click('[data-act=learn]');await p.clock.runFor(300);
ok('5 high-contrast cards',(await p.$$('#lcGrid .lc-card')).length===5,(await p.$$eval('#lcGrid b',b=>b.map(x=>x.textContent))).join(', '));
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/l-center.png'});
await p.click('#lcGrid [data-hci="2"]');await p.clock.runFor(300);
ok('viewer opens full screen on the chosen card',await p.isVisible('#hc.open')&&(await txt(p,'#hcName'))==='Zigzag'&&(await txt(p,'#hcCount'))==='3 / 5');
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/l-viewer.png'});
await p.click('#hc [data-hc=next]');ok('next',(await txt(p,'#hcName'))==='Spiral');
await p.click('#hc [data-hc=prev]');await p.click('#hc [data-hc=prev]');ok('previous',(await txt(p,'#hcName'))==='Checkerboard');
await p.mouse.click(350,400);ok('tap right side = next',(await txt(p,'#hcName'))==='Zigzag');
await p.mouse.click(40,400);ok('tap left side = previous',(await txt(p,'#hcName'))==='Checkerboard');
await p.click('#hc [data-hc=inv]');ok('invert to white on black',await p.evaluate(()=>getComputedStyle(document.getElementById('hc')).backgroundColor)==='rgb(0, 0, 0)');
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/l-viewer-inv.png'});
await p.click('#hc [data-hc=auto]');await p.clock.runFor(10500);ok('auto-advance every 10 s',(await txt(p,'#hcName'))==='Zigzag');
await p.clock.runFor(10000);ok('keeps advancing',(await txt(p,'#hcName'))==='Spiral');
await p.click('#hc [data-hc=auto]');await p.clock.runFor(21000);ok('auto off stops it',(await txt(p,'#hcName'))==='Spiral');
for(let i=0;i<3;i++)await p.click('#hc [data-hc=next]');ok('wraps around',(await txt(p,'#hcName'))==='Checkerboard');
await p.keyboard.press('Escape');await p.clock.runFor(200);ok('Escape closes back to the Learning center',!(await p.isVisible('#hc.open'))&&await p.isVisible('#learnModal.open'));
ok('page scroll restored after closing',await p.evaluate(()=>document.body.style.overflow==='' ));
const w=await phone({w:1280,h:800});await w.click('#menuBtn');await w.click('[data-act=learn]');await w.click('#lcGrid [data-hci="0"]');await w.clock.runFor(300);await w.screenshot({path:(process.env.CRADLE_OUT||'out')+'/l-desktop.png'});
ok('desktop viewer fits screen',await w.evaluate(()=>{const r=document.querySelector('#hcArt svg').getBoundingClientRect();return r.height<=innerHeight&&r.top>=0}));
const d=await phone({w:1280,h:800});ok('no alarm button on desktop',!(await d.isVisible('#phoneAlarm')));
console.log('errors',errs);await b.close();
