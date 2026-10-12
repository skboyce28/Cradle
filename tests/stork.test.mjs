// Stork Flight: start screen, hovering until the first tap, flapping, pausing, crashing, posting,
// boards and the game switch, server-side limits, offline posting, and the Fun center badges
import { chromium } from 'playwright';import { execSync } from 'child_process';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return {p,ctx}}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function up(p,u,key=''){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);
  await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.fill('#gShare',key);await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
const over=p=>p.evaluate(()=>!document.getElementById('skPanel').classList.contains('hidden')&&!!document.querySelector('#skPanel .g-big'));
// fly by tapping in a steady rhythm until the flight ends; returns the end panel text
async function fly(p,every=620){await p.click('#skPanel [data-s=play]');await p.clock.runFor(300);
  for(let i=0;i<200&&!(await over(p));i++){await p.mouse.click(195,420);await p.clock.runFor(every)}
  await p.waitForTimeout(300);return txt(p,'#skPanel')}
const scoreOf=t=>+((t.match(/Bump! ([\d,]+)/)||[])[1]||'0').replace(/,/g,'');
let lastPost=0;
async function scoringFlight(p,ini){for(let a=0;a<8;a++){const wait=10500-(Date.now()-lastPost);if(wait>0)await p.waitForTimeout(wait);
  if(!(await p.isVisible('#skPanel [data-s=play]')))await p.click('#skPanel [data-s=back]').catch(()=>{});
  const e=await fly(p,600+a*15),sc=scoreOf(e);if(sc>0){if(await p.isVisible('#skIni')){await p.fill('#skIni',ini);await p.click('#skIniForm button')}await p.clock.runFor(300);await p.waitForTimeout(1300);lastPost=Date.now();return {sc,post:await txt(p,'#skPost'),end:e}}}
  return {sc:0,post:'',end:''}}
const sfx=Date.now()%100000;
sql("delete from cradle_scores where game='stork'");

const {p:A}=await phone('A');await up(A,'sdad'+sfx);
await A.click('#menuBtn');await A.click('[data-act=fun]');await A.waitForTimeout(200);
ok('Fun center lists all three games, Stork Flight best --',/Bottle Catch[\s\S]*Daily Word[\s\S]*Stork Flight/.test(await txt(A,'#funModal'))&&(await txt(A,'#funStorkBest'))==='--');
await A.click('#funStorkPlay');await A.waitForTimeout(200);
ok('start screen: how to play, buzz and sound',/Tap anywhere to flap/.test(await txt(A,'#skPanel'))&&/lit window is a delivery: \+25/.test(await txt(A,'#skPanel'))&&/Buzz on Sound off/.test(await txt(A,'#skPanel')));
await A.screenshot({path:OUT+'sk-start.png'});
await A.click('#skPanel [data-s=close]');await A.waitForTimeout(200);ok('Close goes back to the Fun center',!(await A.isVisible('#stork'))&&await A.isVisible('#funModal'));
await A.click('#funStorkPlay');await A.click('#skPanel [data-s=play]');await A.clock.runFor(3000);
ok('the stork hovers until the first tap',!(await over(A))&&(await txt(A,'#skScore'))==='0'&&await A.isVisible('#skTip'));
await A.screenshot({path:OUT+'sk-ready.png'});
for(let i=0;i<4;i++){await A.mouse.click(195,420);await A.clock.runFor(600)}
ok('tapping flies; the tip goes away',!(await over(A))&&!(await A.isVisible('#skTip')));
await A.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
ok('auto-pause when switching away',/Paused/.test(await txt(A,'#skPanel')));
await A.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
await A.clock.runFor(3000);ok('nothing moves while paused',/Paused/.test(await txt(A,'#skPanel'))&&!(await over(A)));
await A.click('#skPanel [data-s=resume]');await A.clock.runFor(4000);
ok('without taps the stork glides down and bumps',await over(A),await txt(A,'#skPanel'));
await A.screenshot({path:OUT+'sk-over.png'});
// a flight that scores, with initials
let r1=await scoringFlight(A,'sky');
ok('scoring flight: gaps, then initials, then posted',r1.sc>0&&/\d+ gaps/.test(r1.end)&&/Posted! You're #\d+ on Everyone/.test(r1.post),r1.end.slice(0,80)+' | '+r1.post);
ok('saved in the database as Stork Flight',sql(`select initials||' '||score from cradle_scores where game='stork' order by id desc limit 1`)===`SKY ${r1.sc}`);
ok('your best is saved on the phone',(await A.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('cradle-stork-v1')).best)[0]))>=r1.sc);
await A.screenshot({path:OUT+'sk-posted.png'});
// boards and the game switch
await A.click('#skPanel [data-s=board]');await A.clock.runFor(300);await A.waitForTimeout(900);
ok('board: three games, Stork Flight selected, SKY listed',/Bottle Catch Daily Word Stork Flight/.test(await txt(A,'#skPanel .g-games'))&&await A.$eval('#skPanel [data-fg=stork]',e=>e.classList.contains('on'))&&/SKY/.test(await txt(A,'#skList')),await txt(A,'#skList'));
await A.screenshot({path:OUT+'sk-board.png'});
await A.click('#skPanel [data-fg=word]');await A.waitForTimeout(600);ok('switch to Daily Word',await A.isVisible('#word')&&!(await A.isVisible('#stork')));
await A.click('#wPanel [data-fg=bottles]');await A.waitForTimeout(600);ok('then to Bottle Catch',await A.isVisible('#game')&&!(await A.isVisible('#word'))&&/High scores/.test(await txt(A,'#gPanel')));
await A.click('#gPanel [data-fg=stork]');await A.clock.runFor(300);await A.waitForTimeout(800);ok('and back to Stork Flight',await A.isVisible('#stork')&&!(await A.isVisible('#game'))&&/SKY/.test(await txt(A,'#skList')));
await A.click('#skPanel [data-st=mine]');await A.waitForTimeout(200);ok('My best lists your flight',/SKY/.test(await txt(A,'#skList')));
// family and a stranger
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='sdad${sfx}@cradle.cfg'`);
const {p:M}=await phone('M');await up(M,'smom'+sfx,famKey);await M.click('#menuBtn');await M.click('[data-act=fun]');await M.click('#funStorkPlay');
const rm=await scoringFlight(M,'mum');ok('family member posts',/Posted/.test(rm.post),rm.post);
await M.click('#skPanel [data-s=board]');await M.clock.runFor(300);await M.waitForTimeout(800);await M.click('#skPanel [data-st=family]');await M.waitForTimeout(200);
ok('family board: both of you',/SKY/.test(await txt(M,'#skList'))&&/MUM/.test(await txt(M,'#skList')),await txt(M,'#skList'));
const {p:X}=await phone('X');await up(X,'szed'+sfx);await X.click('#menuBtn');await X.click('[data-act=fun]');await X.click('#funStorkScores');await X.clock.runFor(300);await X.waitForTimeout(900);
ok('stranger: Everyone shows initials only; their family board is empty',/SKY/.test(await txt(X,'#skList'))&&!/@|sdad/.test(await txt(X,'#skList'))&&(await X.click('#skPanel [data-st=family]'),/No family scores yet/.test(await txt(X,'#skList'))),await txt(X,'#skList'));
// server-side limits
const uid=sql(`select id from auth.users where email='szed${sfx}@cradle.cfg'`);
const asX=q=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('server refuses an impossible flight',/isn.t possible for a round that long/.test(asX(`select cradle_submit_score(5000,10,'zed','stork')`)));
ok('server refuses a flight over an hour',/round length isn.t possible/.test(asX(`select cradle_submit_score(100,4000,'zed','stork')`)));
ok('server refuses an unknown game',/unknown game/.test(asX(`select cradle_submit_score(10,10,'zed','pong')`)));
ok('Bottle Catch keeps its 130-second limit',/round length isn.t possible/.test(asX(`select cradle_submit_score(100,200,'zed','bottles')`)));
// offline: saved, then posted
await A.click('#skPanel [data-s=back]');await A.context().setOffline(true);
let so=0;for(let a=0;a<8&&!so;a++)so=scoreOf(await fly(A,600+a*15));
ok('offline flight is saved',so>0&&/It posts when you.re back online/.test(await txt(A,'#skPost')),await txt(A,'#skPost'));
const before=+sql(`select count(*) from cradle_scores where game='stork' and initials='SKY'`);await A.waitForTimeout(Math.max(0,10500-(Date.now()-lastPost)));
await A.context().setOffline(false);await A.evaluate(()=>dispatchEvent(new Event('online')));await A.clock.runFor(4000);await A.waitForTimeout(2000);
ok('posts once back online',+sql(`select count(*) from cradle_scores where game='stork' and initials='SKY'`)===before+1,`${before} -> ${sql(`select count(*) from cradle_scores where game='stork' and initials='SKY'`)}`);
// badges
await A.click('#skPanel [data-s=close]');await A.click('#funModal [data-close]');await A.click('#menuBtn');await A.click('[data-act=ach]');await A.waitForTimeout(300);
const best=await A.evaluate(()=>{const s=JSON.parse(localStorage.getItem('cradle-stork-v1'));return Object.values(s.best)[0]});
const nf=await A.$$eval('#achGrid .ach',as=>as.map(a=>[a.querySelector('b').firstChild.textContent.trim(),a.classList.contains('on'),a.querySelector('.meta').textContent]).find(x=>x[0]==='Night Flyer'));
ok('Night Flyer badge tracks your best flight',nf&&(best>=250?nf[1]:nf[2]===`${best} of 250`),JSON.stringify(nf)+' best '+best);
console.log('errors',errs);await b.close();
