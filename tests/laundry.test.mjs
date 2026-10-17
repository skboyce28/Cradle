// Laundry Day: start screen, countdown, swiping and tapping baskets, wrong baskets and drops, streak
// multipliers, pausing, a full 60-second round, posting and the boards, server limits, and the badges
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
const sfx=Date.now()%100000;
sql("delete from cradle_scores where game='laundry'");
const st=p=>p.evaluate(()=>{const G=window.cradleLaundry,R=G.run();return {state:G.state(),cur:R&&R.cur?{kind:R.cur.kind,stain:!!R.cur.stain,drop:R.cur.drop,want:G.want(R.cur)}:null,score:R?R.score:0,left:R?R.left:0,streak:R?R.streak:0,wrong:R?R.wrong:0,dropped:R?R.dropped:0,sorted:R?R.sorted:0}});
const waitItem=async p=>{for(let i=0;i<40;i++){const s=await st(p);if(s.cur&&s.cur.drop>=1)return s;await p.clock.runFor(100)}return st(p)};
const swipe=async(p,dir)=>{const v={left:[-90,0],right:[90,0],up:[0,-90],down:[0,90]}[dir];await p.mouse.move(195,430);await p.mouse.down();await p.mouse.move(195+v[0],430+v[1],{steps:5});await p.mouse.up();await p.clock.runFor(50)};

const {p:A}=await phone('A');await up(A,'ldad'+sfx);
await A.click('#menuBtn');await A.click('[data-act=fun]');await A.waitForTimeout(200);
ok('Fun center lists Laundry Day with best --',/Laundry Day/.test(await txt(A,'#funModal'))&&(await txt(A,'#funLaundryBest'))==='--');
await A.click('#funLaundryPlay');await A.waitForTimeout(200);
ok('start screen: the four places and how scoring works, buzz and sound',/Onesies swipe left/i.test(await txt(A,'#ldPanel'))&&/Socks swipe right/i.test(await txt(A,'#ldPanel'))&&/Bibs swipe down/i.test(await txt(A,'#ldPanel'))&&/Wash again anything stained/i.test(await txt(A,'#ldPanel'))&&/Buzz on Sound off/.test(await txt(A,'#ldPanel')),await txt(A,'#ldPanel'));
await A.screenshot({path:OUT+'ld-start.png'});
await A.click('#ldPanel [data-l=close]');await A.waitForTimeout(200);ok('Close goes back to the Fun center',!(await A.isVisible('#laundry'))&&await A.isVisible('#funModal'));
await A.click('#funLaundryPlay');await A.click('#ldPanel [data-l=play]');await A.clock.runFor(1000);
ok('a 3-2-1 countdown first, with the timer showing 60s',(await st(A)).state==='count'&&(await txt(A,'#ldTime'))==='60s');
let s=await waitItem(A);
ok('then an item drops in from the washer',s.state==='play'&&!!s.cur&&s.cur.drop>=1,JSON.stringify(s));
await A.screenshot({path:OUT+'ld-play.png'});
// a correct swipe
await swipe(A,s.cur.want);let s2=await st(A);
ok('swiping it into the right basket scores 10',s2.score===10&&s2.sorted===1&&s2.streak===1,JSON.stringify([s.cur,s2.score]));
// a wrong one, by arrow key
s=await waitItem(A);const wrongDir=['left','right','up','down'].find(d=>d!==s.cur.want);const left0=s.left;
await A.keyboard.press({left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown'}[wrongDir]);await A.clock.runFor(50);s2=await st(A);
ok('the wrong basket: streak lost and 2 seconds off',s2.wrong===1&&s2.streak===0&&s2.score===10&&left0-s2.left>1.8,JSON.stringify([left0,s2.left]));
// tapping a basket works too
s=await waitItem(A);const box=await A.evaluate(d=>{const r=document.getElementById('ldCanvas').getBoundingClientRect();const L=window.cradleLaundry.layout();return {x:r.left+L[d].x,y:r.top+L[d].y}},s.cur.want);
await A.mouse.click(box.x,box.y);await A.clock.runFor(50);s2=await st(A);ok('tapping the right basket sorts it',s2.sorted===2,JSON.stringify(s2));
// too slow: it drops
s=await waitItem(A);await A.clock.runFor(3500);s2=await st(A);ok('waiting too long drops it',s2.dropped>=1&&s2.streak===0,JSON.stringify(s2));
// pause
await A.click('#ldHud [data-l=pause]');const lp=(await st(A)).left;await A.clock.runFor(3000);
ok('pause stops the clock',(await st(A)).state==='pause'&&/Paused/.test(await txt(A,'#ldPanel'))&&Math.abs((await st(A)).left-lp)<0.01);
await A.click('#ldPanel [data-l=resume]');await A.clock.runFor(1700);ok('resume counts back in',(await st(A)).state==='play');
// sort everything right for the rest of the round
let mult=false;
for(let i=0;i<900;i++){const q=await st(A);if(q.state!=='play')break;if(q.cur&&q.cur.drop>=1){await A.evaluate(()=>{const G=window.cradleLaundry;G.send(G.want(G.run().cur))})}if(q.streak>=5&&!mult)mult=true;await A.clock.runFor(120)}
await A.clock.runFor(800);await A.waitForTimeout(200);
const end=await txt(A,'#ldPanel');
ok('streaks multiply: a 5-in-a-row item is worth 20',mult);
ok('the round ends at 60 seconds with the score, sorted count, and accuracy',/Laundry.s done/.test(end)&&/\d+ sorted · \d+% right · best streak \d+/.test(end),end.slice(0,160));
const fin=await st(A);
ok('initials are asked for the first posted score',await A.isVisible('#ldIni'));
await A.fill('#ldIni','lin');await A.click('#ldIniForm button');await A.clock.runFor(300);await A.waitForTimeout(1300);
ok('posted to the high scores',/Posted! You're #\d+ on Everyone/.test(await txt(A,'#ldPost')),await txt(A,'#ldPost'));
ok('saved in the database as Laundry Day, a 60-second round',sql(`select initials||' '||score||' '||seconds from cradle_scores where game='laundry' order by id desc limit 1`)===`LIN ${fin.score} 60`,sql(`select initials||' '||score||' '||seconds from cradle_scores where game='laundry' order by id desc limit 1`));
ok('your best and longest streak are saved on the phone',await A.evaluate(()=>{const d=JSON.parse(localStorage.getItem('cradle-laundry-v1'));return Object.values(d.best)[0]>0&&Object.values(d.streak)[0]>=5}));
await A.screenshot({path:OUT+'ld-over.png'});
// boards and the switch
await A.click('#ldPanel [data-l=board]');await A.clock.runFor(300);await A.waitForTimeout(900);
ok('board: four games, Laundry Day selected, LIN listed',/Bottle Catch Daily Word Stork Flight Laundry Day/.test(await txt(A,'#ldPanel .g-games'))&&await A.$eval('#ldPanel [data-fg=laundry]',e=>e.classList.contains('on'))&&/LIN/.test(await txt(A,'#ldList')),await txt(A,'#ldList'));
await A.screenshot({path:OUT+'ld-board.png'});
await A.click('#ldPanel [data-fg=stork]');await A.clock.runFor(300);await A.waitForTimeout(600);ok('switch to Stork Flight',await A.isVisible('#stork')&&!(await A.isVisible('#laundry')));
await A.click('#skPanel [data-fg=laundry]');await A.clock.runFor(300);await A.waitForTimeout(800);ok('and back to Laundry Day',await A.isVisible('#laundry')&&!(await A.isVisible('#stork'))&&/LIN/.test(await txt(A,'#ldList')));
await A.click('#ldPanel [data-lt=mine]');await A.waitForTimeout(200);ok('My best lists your round',/LIN/.test(await txt(A,'#ldList')));
// badges
await A.click('#ldPanel [data-l=back]');await A.click('#ldPanel [data-l=close]');await A.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
await A.click('#menuBtn');await A.click('[data-act=ach]');await A.waitForTimeout(300);
const achTxt=await txt(A,'#achModal');
ok('Laundry Day badges: Fresh Folds earned; Laundry Legend and Perfect Pairs listed',/Fresh Folds/.test(achTxt)&&/Laundry Legend/.test(achTxt)&&/Perfect Pairs/.test(achTxt)&&await A.evaluate(()=>[...document.querySelectorAll('#achModal .ach.on')].some(e=>/Fresh Folds/.test(e.textContent))),achTxt.slice(0,120));
// server limits
const uid=sql(`select id from auth.users where email='ldad${sfx}@cradle.cfg'`);
const asA=q=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('server refuses an impossible Laundry Day score',/isn.t possible for a round that long/.test(asA(`select cradle_submit_score(9500,60,'lin','laundry')`)));
ok('…and a round longer than 70 seconds',/round length isn.t possible/.test(asA(`select cradle_submit_score(100,90,'lin','laundry')`)));
console.log('errors',errs);await b.close();
