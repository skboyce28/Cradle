// Tummy time: logging with the timer or by typing minutes, the daily goal in Settings, the Log card,
// the Dashboard (tile, chart, filter, insight), History, print, the doctor report, and export/import.
import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-bath.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone(data=DEMO){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,acceptDownloads:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch','splash'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>{window.print=()=>{dispatchEvent(new Event('beforeprint'))};document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+String(extra).replace(/\s+/g,' ').slice(0,240):''));
const K='2026-10-09',tum=async p=>(await S(p)).days[K].feeds.filter(f=>f.tummy);

const p=await phone();
const feedsB=(await txt(p,'#stats')).match(/Feeds (\d+)/i)[1];
ok('Log shows a Tummy time card with the default 15 min goal',/Tummy time 0 of 15 min goal/i.test(await txt(p,'#tummyCard')),await txt(p,'#tummyCard'));
// the button logs a row and starts the timer
await p.click('#addTummy');await p.clock.runFor(300);
let t=await tum(p);
ok('🤸 Tummy time adds a row at the current time with its timer running',t.length===1&&t[0].time==='14:40'&&t[0].mins==null&&await p.isVisible('.feed.tummyrow [data-ttimer].on'),JSON.stringify(t[0]));
ok('it says the timer is running',/Tummy time started/i.test(await txt(p,'#toast'))&&/timer running/i.test(await txt(p,'#tummyCard')));
ok('the row is labeled 🤸, not counted as a feed',(await txt(p,'.feed.tummyrow .n'))==='🤸'&&(await txt(p,'#stats')).match(/Feeds (\d+)/i)[1]===feedsB);
await p.clock.runFor(4*60e3+30e3);await p.waitForTimeout(200);
ok('the timer counts up on the row',/^4:3\d$/i.test(await txt(p,'.feed.tummyrow [data-ttrun]')),await txt(p,'.feed.tummyrow [data-ttrun]'));
await p.screenshot({path:OUT+'tummy-log.png'});
await p.click('.feed.tummyrow [data-ttimer]');await p.clock.runFor(300);
t=await tum(p);ok('■ stops it and saves the minutes (4½ rounds to 5)',t[0].mins===5&&!(await S(p)).tummyRun,JSON.stringify(t[0]));
ok('toast and card show progress toward the goal',/Tummy time: 5 min\. 5 of 15 min today/i.test(await txt(p,'#toast'))&&/Tummy time 5 of 15 min goal · 1 session/i.test(await txt(p,'#tummyCard')),await txt(p,'#tummyCard'));
// a second session: type the minutes instead
await p.click('#addTummy');await p.clock.runFor(200);await p.click('.feed.tummyrow [data-ttimer].on');await p.clock.runFor(200);
const rows=await p.$$('.feed.tummyrow');const last=rows[rows.length-1];
await (await last.$('input[data-k=mins]')).fill('11');await p.clock.runFor(300);
ok('typed minutes count too, and the goal is reached (ring turns green)',/16 of 15 min goal · 2 sessions/i.test(await txt(p,'#tummyCard'))&&await p.$eval('#tummyCard .ring .fg',c=>c.getAttribute('stroke'))==='var(--good)',await txt(p,'#tummyCard'));
await (await last.$('input[data-k=note]')).fill('On a mat');await p.clock.runFor(300);
ok('notes save',(await tum(p)).some(f=>f.note==='On a mat'));
// only one timer at a time: starting another stops the first
await p.click('#addTummy');await p.clock.runFor(60e3);await p.click('#addTummy');await p.clock.runFor(300);
t=await tum(p);ok('starting a new one stops the running one and saves its minute',t.length===4&&t.filter(f=>f.mins===1).length>=1&&(await S(p)).tummyRun&&(await p.$$('.feed.tummyrow [data-ttimer].on')).length===1);
// delete
const lastRow=(await p.$$('.feed.tummyrow')).pop();await (await lastRow.$('.del')).click();await p.waitForTimeout(200);
ok('delete asks about tummy time',(await txt(p,'#askMsg'))==='Delete this tummy time?');await p.click('#askOk');await p.clock.runFor(300);
ok('deleted, and its timer stopped',(await tum(p)).length===3&&!(await S(p)).tummyRun);
// an earlier day: no timer, enter the time and minutes
await p.click('#prevDay').catch(async()=>{await p.evaluate(()=>document.querySelector('.datebar button')?.click())});await p.clock.runFor(300);
const yk=await p.evaluate(()=>document.getElementById('dateIn').value);
if(yk!==K){await p.click('#addTummy');await p.clock.runFor(300);ok('on an earlier day the timer doesn’t start',!(await S(p)).tummyRun&&/Enter the time and minutes/i.test(await txt(p,'#toast')));
  const yr=(await p.$$('.feed.tummyrow')).pop();await (await yr.$('input[type=time]')).fill('09:30');await (await yr.$('input[type=time]')).dispatchEvent('change');await p.clock.runFor(200);
  const yr2=(await p.$$('.feed.tummyrow')).pop();await (await yr2.$('input[data-k=mins]')).fill('8');await p.clock.runFor(300);
  ok('earlier day saved',(await S(p)).days[yk].feeds.some(f=>f.tummy&&f.mins===8&&f.time==='09:30'));
  await p.evaluate(()=>{document.getElementById('dateIn').value='2026-10-09';document.getElementById('dateIn').dispatchEvent(new Event('change',{bubbles:true}))});await p.clock.runFor(300);
}else ok('previous-day button found',false);

// Settings: the goal
await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
ok('Settings has the tummy time goal, 15 to start',(await p.inputValue('#sTummy'))==='15');
await p.fill('#sTummy','20');await p.click('#settingsModal .primary');await p.clock.runFor(300);
ok('new goal saved and shown on the Log',(await S(p)).settings.tummyGoal===20&&/17 of 20 min goal/i.test(await txt(p,'#tummyCard')),await txt(p,'#tummyCard'));

// Dashboard
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(500);
const kp=await txt(p,'#kpis');
ok('Dashboard tile: tummy time per day, goal met, today so far',/Tummy time per day \d+ min Goal 20 min met on 0 of 6 completed days\. Today so far: 17 min/i.test(kp),kp.match(/Tummy time per day.*?(?=Side starts)/i)?.[0]);
ok('daily tummy time chart with the goal line',(await p.$$('#chart6 path.bar')).length===7&&/20 min goal/i.test(await p.$eval('#chart6',e=>e.innerHTML)));
const ins=await txt(p,'#insights');ok('insight about tummy time',/🤸 \d+ min of tummy time in \d+ sessions? over 6 completed days, about \d+ min a day/i.test(ins)&&/Below the 20 min goal on/i.test(ins),ins.match(/🤸[^🤱]*/)?.[0]);
await p.click('#dashFilter [data-f=tummy]');await p.clock.runFor(300);
const vis=await p.$$eval('#tab-dash [data-cat]',els=>els.filter(e=>!e.classList.contains('fhide')&&e.offsetParent).map(e=>e.dataset.cat));
ok('the Tummy time filter shows only tummy time',vis.length>=3&&vis.every(c=>c.split(' ').includes('tummy')),JSON.stringify(vis));
await p.screenshot({path:OUT+'tummy-dash.png',fullPage:true});
await p.click('.xbtn[data-chart=c6]');await p.clock.runFor(400);
ok('enlarged chart lists tummy minutes per day',await p.isVisible('#chartModal')&&/Tummy min/i.test(await txt(p,'#cmTable'))&&/Tummy time 17 min of 20/i.test(await txt(p,'#cmSel')),await txt(p,'#cmSel'));
await p.keyboard.press('Escape');await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
await p.click('#dashFilter [data-f=all]');
// doctor report and day sheet
await p.click('[data-report]');await p.clock.runFor(800);const rep=await p.evaluate(()=>document.getElementById('print').innerText);await p.evaluate(()=>dispatchEvent(new Event('afterprint')));
ok('doctor report has tummy time',/Tummy time: \d+ min\/day \(goal 20\)/i.test(rep)&&/Tummy min/i.test(rep));
await p.click('#tabs [data-tab=today]');await p.clock.runFor(300);
await p.click('#tab-today [data-print]').catch(()=>p.evaluate(()=>document.querySelector('[data-print]').click()));await p.clock.runFor(800);const sheet=await p.evaluate(()=>document.getElementById('print').innerText);
ok('day sheet lists tummy time',/🤸 Tummy time · 5 min/i.test(sheet)&&/Tummy time: 17 min of 20/i.test(sheet));
// History
await p.click('#tabs [data-tab=hist]');await p.clock.runFor(300);
ok('History card tag',/🤸 17 min/i.test(await txt(p,'#histBody')));
// turning tummy time off (Settings, What you track) hides it everywhere; the data stays
await p.click('#tabs [data-tab=today]');await p.clock.runFor(300);await p.click('#addTummy');await p.clock.runFor(300);
await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
ok('Settings: a 🤸 Tummy time box under What you track, on to start',await p.isChecked('#sTrTummy')&&await p.isVisible('#sTummyField'));
await p.uncheck('#sTrTummy');ok('unticking it hides the goal right away',!(await p.isVisible('#sTummyField')));
await p.click('#settingsModal .primary');await p.clock.runFor(400);
let st0=await S(p);ok('saved for the family, and the running timer is stopped',st0.settings.track.tummy===false&&!st0.tummyRun);
ok('the Log: no button, no card, and tummy rows hidden',!(await p.isVisible('#addTummy'))&&!(await p.$('#tummyCard'))&&(await p.$$eval('.feed.tummyrow',els=>els.filter(e=>e.offsetParent).length))===0);
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(500);
ok('the Dashboard: no tummy tile, chart, filter, or insight',!/Tummy time per day/i.test(await txt(p,'#kpis'))&&!(await p.isVisible('#chart6'))&&!(await p.isVisible('#dashFilter [data-f=tummy]'))&&!/🤸/.test(await txt(p,'#insights')));
await p.click('[data-report]');await p.clock.runFor(800);const rep2=await p.evaluate(()=>document.getElementById('print').innerText);await p.evaluate(()=>dispatchEvent(new Event('afterprint')));
ok('the doctor report leaves it out',!/Tummy/i.test(rep2));
await p.click('#tabs [data-tab=hist]');await p.clock.runFor(300);ok('History leaves it out',!/🤸/.test(await txt(p,'#histBody')));
ok('the tummy rows are still saved',(await tum(p)).length===4);
await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);await p.check('#sTrTummy');
ok('ticking it again shows the goal',await p.isVisible('#sTummyField'));await p.click('#settingsModal .primary');await p.clock.runFor(400);
await p.click('#tabs [data-tab=today]');await p.clock.runFor(300);
ok('back on: the button, the card, and the rows are back',await p.isVisible('#addTummy')&&await p.isVisible('#tummyCard')&&(await p.$$eval('.feed.tummyrow',els=>els.filter(e=>e.offsetParent).length))===4);
{const r=(await p.$$('.feed.tummyrow')).pop();await (await r.$('.del')).click();await p.click('#askOk');await p.clock.runFor(300)}
// export and import
await p.click('#menuBtn');await p.click('[data-act=data]');await p.click('[data-dm=export]');await p.clock.runFor(300);
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('text=Download file')]);const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
const exT=ex.days[K].feeds.filter(f=>f.tummy);ok('export keeps tummy time and the goal',exT.length===3&&exT.some(f=>f.mins===5)&&ex.settings.tummyGoal===20);
const q=await phone(JSON.stringify({settings:{theme:'light',v2:1},baseVersion:99,days:{}}));
await q.click('#menuBtn');await q.click('[data-act=data]');await q.click('[data-dm=import]');await q.clock.runFor(200);
await q.setInputFiles('#fileIn',{name:'c.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ex))});await q.clock.runFor(500);
await q.click('#impReplace');await q.click('#askOk');await q.clock.runFor(500);
const qs=await S(q);ok('import brings tummy time back, not as feeds',qs.days[K].feeds.filter(f=>f.tummy).length===3&&qs.settings.tummyGoal===20&&qs.days[K].feeds.filter(f=>f.tummy).every(f=>!f.left&&!f.bottle));
console.log('errors',errs);await b.close();
