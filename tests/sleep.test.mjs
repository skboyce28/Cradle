// Sleep: off until turned on in Settings; 😴 Asleep and ☀️ Woke up (on the Log and Night shift), typed
// times, a sleep that crosses midnight split between days, naps vs night, the wake window, the goal,
// the Log card, the Dashboard (tile, chart, filter, insight), History, print, the doctor report, export/import.
import { chromium } from 'playwright';import fs from 'fs';
const DEMO=JSON.parse(fs.readFileSync(new URL('./fixtures/demo-bath.json',import.meta.url),'utf8'));const OUT=(process.env.CRADLE_OUT||'out')+'/';
// last night: 9pm to 2am (crosses midnight into today)
DEMO.days['2026-10-08'].feeds.push({id:'sl-night',time:'21:00',end:'02:00',sleep:true,mins:300,note:'Bassinet'});
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone(data=JSON.stringify(DEMO)){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,acceptDownloads:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch','splash'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>{window.print=()=>{dispatchEvent(new Event('beforeprint'))};document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+String(extra).replace(/\s+/g,' ').slice(0,240):''));
const K='2026-10-09',sl=async p=>(await S(p)).days[K].feeds.filter(f=>f.sleep);
const settings=async(p,fn)=>{await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);await fn();await p.click('#sSave');await p.clock.runFor(300)};

const p=await phone();
ok('off to start: no Asleep button, card, or Dashboard chip',!(await p.isVisible('#addSleep'))&&!(await p.$('#sleepCard'))&&!(await p.isVisible('#sleepLine')));
await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
ok('Settings: Sleep under What you track, off; the goal is hidden until it’s on',!(await p.isChecked('#sTrSleep'))&&!(await p.isVisible('#sSleep')));
await p.check('#sTrSleep');await p.click('#sSave');await p.clock.runFor(300);
ok('turned on: it’s saved in the shared settings',(await S(p)).settings.track.sleep===true);
await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
ok('…and the goal shows, 15 hours to start',await p.isVisible('#sSleep')&&(await p.inputValue('#sSleep'))==='15');
await p.click('#settingsModal [data-close]');
const feedsB=(await txt(p,'#stats')).match(/Feeds (\d+)/i)[1];
ok('Log: Asleep button, and the card counts last night’s sleep after midnight',await p.isVisible('#addSleep')&&/Sleep 2h of 15h goal · naps 0m, night 2h/i.test(await txt(p,'#sleepCard')),await txt(p,'#sleepCard'));
ok('the wake window since last night',/Awake 12h 40m since 2:00\s?am/i.test(await txt(p,'#sleepLine')),await txt(p,'#sleepLine'));

// fall asleep now
await p.click('#addSleep');await p.clock.runFor(300);
let s=await sl(p);
ok('😴 Asleep adds a sleep at the current time, still going',s.length===1&&s[0].time==='14:40'&&s[0].end===''&&/Asleep at 2:40\s?pm/i.test(await txt(p,'#toast')),JSON.stringify(s));
ok('the button becomes ☀️ Woke up, and it isn’t counted as a feed',(await txt(p,'#addSleep'))==='☀️ Woke up'&&(await txt(p,'#stats')).match(/Feeds (\d+)/i)[1]===feedsB&&(await txt(p,'.feed.sleeprow .n'))==='😴');
await p.clock.runFor(95*60e3);await p.waitForTimeout(300);
ok('asleep for 1h 35m, on the line, the row, and the card',/Asleep 1h 35m since 2:40\s?pm/i.test(await txt(p,'#sleepLine'))&&/1h 35m/.test(await txt(p,'.feed.sleeprow .slen'))&&/asleep now/i.test(await txt(p,'#sleepCard')),await txt(p,'#sleepLine'));
await p.screenshot({path:OUT+'sleep-log.png'});
await p.click('#addSleep');await p.clock.runFor(300);
s=await sl(p);
ok('☀️ Woke up saves the wake time and length',s[0].end==='16:15'&&s[0].mins===95&&/Slept 1h 35m\. 3h 35m today of 15h/i.test(await txt(p,'#toast')),JSON.stringify(s[0])+' '+await txt(p,'#toast'));
ok('naps and night add up on the card',/3h 35m of 15h goal · naps 1h 35m, night 2h/i.test(await txt(p,'#sleepCard')),await txt(p,'#sleepCard'));
ok('awake again',/Awake 0m since 4:15\s?pm/i.test(await txt(p,'#sleepLine'))&&(await txt(p,'#addSleep'))==='😴 Asleep');
// edit the wake time by typing
const end=await p.$('.feed.sleeprow input[data-k=end]');await end.fill('16:45');await end.dispatchEvent('change');await p.clock.runFor(300);
ok('typing a wake time recalculates the length',(await sl(p))[0].mins===125&&/2h 05m/.test(await txt(p,'.feed.sleeprow .slen')));
await (await p.$('.feed.sleeprow input[data-k=note]')).fill('Contact nap');await p.clock.runFor(300);
ok('notes save',(await sl(p))[0].note==='Contact nap');

// Night shift
await p.clock.runFor(5.5*3600e3);await p.waitForTimeout(200);
await p.evaluate(()=>document.getElementById('nightBtn').click());await p.waitForTimeout(300);
ok('Night shift has a 😴 Asleep button',await p.isVisible('#night [data-n=sleep]')&&/😴 Asleep/.test(await txt(p,'#night [data-n=sleep]')));
await p.click('#night [data-n=sleep]');await p.clock.runFor(30*60e3);await p.waitForTimeout(200);await p.evaluate(()=>{const b=document.querySelector('#night [data-n=sleep]');if(b)b.closest('#night');});
await p.evaluate(()=>dispatchEvent(new Event('focus')));
const nightRow=(await sl(p)).find(f=>f.time==='21:45');
ok('…which logs a night sleep',nightRow&&nightRow.end==='');
await p.click('#night [data-n=exit2]').catch(()=>{});await p.waitForTimeout(200);
await p.evaluate(()=>document.getElementById('nightBtn').click());await p.waitForTimeout(300);
ok('…and then shows ☀️ Woke up with how long',/☀️ Woke up · asleep 30m/.test(await txt(p,'#night [data-n=sleep]')),await txt(p,'#night [data-n=sleep]'));
await p.click('#night [data-n=sleep]');await p.waitForTimeout(200);
ok('Woke up from Night shift',(await sl(p)).find(f=>f.time==='21:45').end==='22:15');
await p.click('#night [data-n=exit2]').catch(()=>{});await p.evaluate(()=>document.querySelectorAll('#night.open').forEach(n=>n.classList.remove('open')));
ok('the row shows 🌙 for night sleep',(await p.$$eval('.feed.sleeprow .n',ns=>ns.map(n=>n.textContent))).includes('🌙'));

// goal
await settings(p,async()=>{await p.fill('#sSleep','14')});
ok('a new goal is saved and shown',(await S(p)).settings.sleepGoal===14&&/of 14h goal/.test(await txt(p,'#sleepCard')));

// Dashboard
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(500);
const kp=await txt(p,'#kpis');
ok('Dashboard tile: sleep per day, goal, longest stretch, today so far',/Sleep per day 3h Goal 14h met on 0 of 1 completed day with sleep logged\. Longest stretch 5h\. Today so far: 4h 35m/i.test(kp),kp.match(/Sleep per day.*?(?=Side starts)/i)?.[0]);
ok('daily sleep chart with night and naps and the goal line',(await p.$$('#chart7 path.bar')).length>=1&&(await p.$$('#chart7 rect[fill="#8f9de6"]')).length===1&&/14h goal/.test(await p.$eval('#chart7',e=>e.innerHTML)));
ok('insight about sleep',/😴 About 3h of sleep a day \(0m of it in naps\) over 1 completed day with sleep logged, 3 sleeps in these 7 days\. Below the 14h goal on Thu/i.test(await txt(p,'#insights')),(await txt(p,'#insights')).match(/😴[^🤸⚖🤱]*/)?.[0]);
await p.click('#dashFilter [data-f=sleep]');await p.clock.runFor(300);
const vis=await p.$$eval('#tab-dash [data-cat]',els=>els.filter(e=>!e.classList.contains('fhide')&&e.offsetParent).map(e=>e.dataset.cat));
ok('the Sleep filter shows only sleep',vis.length>=3&&vis.every(c=>c.split(' ').includes('sleep')),JSON.stringify(vis));
await p.screenshot({path:OUT+'sleep-dash.png',fullPage:true});
await p.click('.xbtn[data-chart=c7]');await p.clock.runFor(400);
ok('enlarged chart: a Sleep column and the day’s sleep',/Sleep/i.test(await txt(p,'#cmTable thead'))&&/Sleep 4h 35m of 14h · naps 2h 05m/i.test(await txt(p,'#cmSel')),await txt(p,'#cmSel'));
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
await p.click('#dashFilter [data-f=all]');
await p.click('[data-report]');await p.clock.runFor(800);const rep=await p.evaluate(()=>document.getElementById('print').innerText);await p.evaluate(()=>dispatchEvent(new Event('afterprint')));
ok('doctor report: average sleep and a Sleep column',/Sleep: 3h\/day \(naps 0m, on 1 day with sleep logged\) \(goal 14h\)/i.test(rep)&&/Tummy min\s*Sleep\s*Longest gap/i.test(rep),rep.match(/Tummy min.{0,40}/is)?.[0]);
await p.click('#tabs [data-tab=today]');await p.clock.runFor(300);
await p.evaluate(()=>document.querySelector('[data-print]').click());await p.clock.runFor(800);const sheet=await p.evaluate(()=>document.getElementById('print').innerText);
ok('day sheet lists each sleep and the total',/😴 Sleep to 4:45\s?pm · 2h 05m/i.test(sheet)&&/Sleep: 4h 35m of 14h \(naps 2h 05m\)/i.test(sheet),sheet.match(/Sleep:[^|]*$/m)?.[0]);
await p.click('#tabs [data-tab=hist]');await p.clock.runFor(300);
ok('History: 😴 tag with the day’s total',/😴 4h 35m/.test(await txt(p,'#histBody'))&&/😴 3h/.test(await txt(p,'#histBody')));

// export and import
await p.click('#tabs [data-tab=today]');
await p.click('#menuBtn');await p.click('[data-act=data]');await p.click('[data-dm=export]');await p.clock.runFor(300);
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('text=Download file')]);const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
ok('export keeps sleeps, wake times, the switch, and the goal',ex.days[K].feeds.filter(f=>f.sleep).length===2&&ex.days[K].feeds.some(f=>f.sleep&&f.end==='16:45')&&ex.settings.track.sleep===true&&ex.settings.sleepGoal===14);
const q=await phone(JSON.stringify({settings:{theme:'light',v2:1},baseVersion:99,days:{}}));
await q.click('#menuBtn');await q.click('[data-act=data]');await q.click('[data-dm=import]');await q.clock.runFor(200);
await q.setInputFiles('#fileIn',{name:'c.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ex))});await q.clock.runFor(500);
await q.click('#impReplace');await q.click('#askOk');await q.clock.runFor(500);
const qs=await S(q);ok('import brings sleep back, not as feeds',qs.days[K].feeds.filter(f=>f.sleep).length===2&&qs.days['2026-10-08'].feeds.some(f=>f.sleep&&f.end==='02:00')&&qs.settings.track.sleep===true);

// turning it off hides it but keeps what was logged
await settings(p,async()=>{await p.uncheck('#sTrSleep')});
ok('off again: hidden everywhere, nothing deleted',!(await p.isVisible('#addSleep'))&&!(await p.$('#sleepCard'))&&!(await p.isVisible('.feed.sleeprow'))&&(await sl(p)).length===2);
console.log('errors',errs);await b.close();
