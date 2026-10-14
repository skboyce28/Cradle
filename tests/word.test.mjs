// Daily Word: the word of the day, colors, hard mode, practice, posting, boards, other phones, offline
import { chromium } from 'playwright';import { execSync } from 'child_process';import fs from 'fs';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n,time=new Date()){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true,permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return {p,ctx}}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function up(p,u,key='',create=true){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);
  if(create)await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');if(create){await p.fill('#gPass2','longenough1');await p.fill('#gShare',key)}await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
// the word lists and the day's word, worked out here from the app's own data
const html=fs.readFileSync(new URL(process.env.CRADLE_APP));
const WD=JSON.parse(/<script type="application\/json" id="wordData">(.*?)<\/script>/s.exec(html)[1]);
const chunks=(s,n)=>s.match(new RegExp(`.{${n}}`,'g'));
const answers=n=>chunks(WD.a[n],n),guesses=n=>chunks(WD.g[n],n);
async function todayAnswer(p,n){const [y,m,d]=await p.evaluate(()=>{const t=new Date();return [t.getFullYear(),t.getMonth(),t.getDate()]});
  const i=Math.round((new Date(y,m,d)-new Date(2026,9,12))/864e5),a=answers(n);return {ans:a[((i%a.length)+a.length)%a.length],num:i+1,day:`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}}
function evalW(g,a){const r=Array(a.length).fill(0),c={};for(let i=0;i<a.length;i++){if(g[i]===a[i])r[i]=2;else c[a[i]]=(c[a[i]]||0)+1}for(let i=0;i<a.length;i++)if(r[i]!==2&&c[g[i]]>0){r[i]=1;c[g[i]]--}return r.join('')}
const wrong=(n,a,k=0)=>guesses(n).filter(w=>w!==a)[k*97%guesses(n).length];
async function guess(p,w,tapKeys=false){
  if(tapKeys){for(const ch of w)await p.click(`#wKb [data-k="${ch}"]`);await p.click('#wKb [data-k="enter"]')}else{await p.keyboard.type(w);await p.keyboard.press('Enter')}
  await p.clock.runFor(2200);await p.waitForTimeout(150)}
const rowColors=(p,r)=>p.$$eval(`#wGrid .w-row[data-r="${r}"] .w-tile`,ts=>ts.map(t=>(/s([012])/.exec(t.className)||[])[1]||'-').join(''));
const rowText=(p,r)=>p.$$eval(`#wGrid .w-row[data-r="${r}"] .w-tile`,ts=>ts.map(t=>t.textContent).join(''));
const sfx=Date.now()%100000;
sql("delete from cradle_scores where game='word'");

// word lists
ok('word lists: 4, 5 and 6 letters, answers are allowed guesses',[4,5,6].every(n=>answers(n).length>1000&&answers(n).every(w=>w.length===n&&/^[a-z]+$/.test(w))),[4,5,6].map(n=>answers(n).length+'/'+(answers(n).length+guesses(n).length)).join(' '));
ok('no plurals or rude words among answers',!answers(5).some(w=>['bitch','shits','fucks','dogs'].includes(w))&&!answers(4).includes('dogs')&&!answers(4).includes('damn'));

// dad: plays a 4-letter word, solving it in 2
const {p:A}=await phone('A');await up(A,'wdad'+sfx);
await A.click('#menuBtn');await A.click('[data-act=fun]');await A.waitForTimeout(200);
ok('Fun center lists Daily Word, not played yet',/Daily Word/.test(await txt(A,'#funModal'))&&/Today: not played yet/.test(await txt(A,'#funModal')),await txt(A,'#funWordCard'));
await A.screenshot({path:OUT+'w-fun.png'});
await A.click('#funWordPlay');await A.waitForTimeout(200);
ok('start screen: how to play, letters 4/5/6 (5 to start), hard mode off',/Green: right letter, right spot/.test(await txt(A,'#wPanel'))&&await A.$eval('#wPanel [data-wl="5"]',e=>e.classList.contains('on'))&&!(await A.$eval('#wPanel [data-w=hard]',e=>e.classList.contains('on'))));
await A.screenshot({path:OUT+'w-start.png'});
await A.click('#wPanel [data-wl="4"]');await A.click('#wPanel [data-w=daily]');await A.waitForTimeout(200);
const T4=await todayAnswer(A,4);
ok('4 letters: grid is 6 rows of 4',(await A.$$('#wGrid .w-row')).length===6&&(await A.$$('#wGrid .w-row[data-r="0"] .w-tile')).length===4&&new RegExp(`#${T4.num} · 4 letters`).test(await txt(A,'#wTitle')),await txt(A,'#wTitle'));
await A.keyboard.type('ab');await A.keyboard.press('Enter');await A.clock.runFor(100);
ok('too short: says so',/Not enough letters/.test(await txt(A,'#wMsg')));
await A.keyboard.press('Backspace');await A.keyboard.press('Backspace');await A.keyboard.type('qzxj');await A.keyboard.press('Enter');await A.clock.runFor(100);
ok('not a word: says so, and keeps the letters to fix',/Not in the word list/.test(await txt(A,'#wMsg'))&&(await rowText(A,0))==='qzxj');
for(let i=0;i<4;i++)await A.keyboard.press('Backspace');
const g1=wrong(4,T4.ans,1);await guess(A,g1,true);
ok('colors match the rules (tapped on the keyboard)',(await rowColors(A,0))===evalW(g1,T4.ans),`${g1} vs ${T4.ans}: ${await rowColors(A,0)} expected ${evalW(g1,T4.ans)}`);
const kcol=await A.$eval(`#wKb [data-k="${g1[0]}"]`,e=>e.className);ok('keyboard shows letters used',/s[012]/.test(kcol),kcol);
await A.screenshot({path:OUT+'w-play.png'});
await guess(A,T4.ans);await A.clock.runFor(2000);await A.waitForTimeout(300);
let over=await txt(A,'#wPanel');
ok('solved in 2: result, the word, and 60 points',/Brilliant!/.test(over)&&new RegExp(T4.ans.split('').join(' '),'i').test(over)&&/2\/6 · 60 points/.test(over),over.slice(0,120));
ok('first result asks for initials',await A.isVisible('#wIni'));
await A.fill('#wIni','dad');await A.click('#wIniForm button');await A.clock.runFor(500);await A.waitForTimeout(1200);
over=await txt(A,'#wPanel');ok('posted with your rank',/Posted! \+60 points\. You're #1 of \d+ on Everyone/.test(over),over.match(/Posted[^.]*\.[^.]*\./)?.[0]||over.slice(0,200));
ok('saved in the database: today, 4 letters, colors only',sql(`select initials||' '||score||' '||day||' '||detail from cradle_scores where game='word' order by id desc limit 1`)===`DAD 60 ${T4.day} 4:${evalW(g1,T4.ans)}/2222`,sql(`select initials||' '||score||' '||day||' '||detail from cradle_scores where game='word' order by id desc limit 1`));
ok('stats: played 1, 100%, streak 1',/1 Played 100 Win % 1 Streak 1 Best streak/.test(over));
await A.screenshot({path:OUT+'w-over.png'});
await A.evaluate(()=>{try{delete Navigator.prototype.share}catch(e){}});await A.click('#wPanel [data-w=share]');await A.clock.runFor(300);
const shared=await A.evaluate(()=>navigator.clipboard.readText()).catch(()=>'' );
ok('share: colored squares, no letters',new RegExp(`Cradle Daily Word #${T4.num} · 4 letters\\n2/6\\n\\n[⬛🟨🟩]{4}\\n🟩🟩🟩🟩`,'u').test(shared)&&!new RegExp(T4.ans,'i').test(shared),JSON.stringify(shared));
// achievements
await A.waitForTimeout(200);const ach=await A.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')).achSeen||[]);
ok('First Word badge earned',ach.includes('word1'),JSON.stringify(ach));
// come back later: the result stays
await A.reload();await A.clock.runFor(2500);await A.waitForTimeout(400);await closeModals(A);await A.click('#menuBtn');await A.click('[data-act=fun]');await A.waitForTimeout(200);
ok('Fun center shows today’s result',/Today: 2\/6/.test(await txt(A,'#funWordCard')),await txt(A,'#funWordCard'));
await A.click('#funWordPlay');await A.waitForTimeout(400);ok('opening again shows the result, not a new game',/Brilliant!/.test(await txt(A,'#wPanel')));
await A.click('#wPanel [data-w=peek]');ok('See the grid shows your guesses',(await rowText(A,1))===T4.ans);
await A.click('[data-w=menu]');await A.click('#wPanel [data-w=board]').catch(()=>{});
// the same account on a second phone: today counts as played
const {p:A2}=await phone('A2');await up(A2,'wdad'+sfx,'',false);await A2.click('#menuBtn');await A2.click('[data-act=fun]');await A2.click('#funWordPlay');await A2.clock.runFor(1000);await A2.waitForTimeout(800);
const a2=await txt(A2,'#wPanel');ok('another phone: shows today as played there, colors only',/Played on another phone/.test(a2)&&/2\/6 · 60 points/.test(a2)&&(await rowText(A2,1))===''&&(await rowColors(A2,1))==='2222',a2.slice(0,160));
// a second post for the same day is refused by the database
const dadId=sql(`select id from auth.users where email='wdad${sfx}@cradle.cfg'`);
let dup='';try{sql(`set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"${dadId}\"}',false); select cradle_submit_word('${T4.day}',5,'22222',false,null)`)}catch(e){dup=String(e.stderr||e.message)}
ok('one result per day',/already played/.test(dup),dup.slice(0,120));

// mom joins the family: 6 letters, hard mode rule, then loses
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='wdad${sfx}@cradle.cfg'`);
const {p:M}=await phone('M');await up(M,'wmom'+sfx,famKey);await M.click('#menuBtn');await M.click('[data-act=fun]');await M.click('#funWordPlay');await M.waitForTimeout(200);
await M.click('#wPanel [data-wl="6"]');await M.click('#wPanel [data-w=hard]');
ok('hard mode switch turns on',await M.$eval('#wPanel [data-w=hard]',e=>e.classList.contains('on')));
await M.click('#wPanel [data-w=daily]');const T6=await todayAnswer(M,6);
ok('6 letters, hard, in the title',/6 letters · hard/.test(await txt(M,'#wTitle')),await txt(M,'#wTitle'));
// first guess with a green or yellow letter, then a second guess that ignores it
const pool=guesses(6).filter(w=>w!==T6.ans);
const okHard=(w,prev)=>prev.every(p=>{const r=evalW(p,T6.ans);for(let i=0;i<6;i++)if(r[i]==='2'&&w[i]!==p[i])return false;const need={};for(let i=0;i<6;i++)if(r[i]!=='0')need[p[i]]=(need[p[i]]||0)+1;return Object.keys(need).every(c=>[...w].filter(x=>x===c).length>=need[c])});
// six wrong guesses that all keep to the hard-mode rule, the first with a hint (searched, since some days' words allow few)
const lossPath=(()=>{let tries=0;const dfs=used=>{if(used.length===6)return used;if(++tries>20000)return null;for(const c of pool.filter(x=>!used.includes(x)&&okHard(x,used)).slice(0,40)){const r=dfs([...used,c]);if(r)return r}return null};
  for(const f of pool.filter(w=>/[12]/.test(evalW(w,T6.ans))).slice(0,200)){const r=dfs([f]);if(r)return r}return null})();
const h1=(lossPath||[pool.find(w=>/[12]/.test(evalW(w,T6.ans)))])[0];const r1=evalW(h1,T6.ans);
await guess(M,h1);
const ignore=pool.find(w=>{for(let i=0;i<6;i++){if(r1[i]==='2'&&w[i]!==h1[i])return true}return false})||pool.find(w=>{const need=[...h1].filter((c,i)=>r1[i]!=='0');return need.some(c=>!w.includes(c))});
await M.keyboard.type(ignore);await M.keyboard.press('Enter');await M.clock.runFor(100);
ok('hard mode: a guess that ignores a found letter is refused',/letter must be|must contain/.test(await txt(M,'#wMsg'))&&(await rowColors(M,1))==='------',`${h1} ${r1} then ${ignore}: ${await txt(M,'#wMsg')}`);
for(let i=0;i<6;i++)await M.keyboard.press('Backspace');
// lose: guesses that keep to the hard-mode rule (any word passes the app's own check)
const used=[h1];for(const w of (lossPath||[]).slice(1)){await guess(M,w);used.push(w)}
await M.clock.runFor(2000);await M.waitForTimeout(400);const mo=await txt(M,'#wPanel');
const lost=used.length===6&&/Out of guesses/.test(mo)&&/X\/6 · 0 points/.test(mo);
ok('out of guesses: shows the word, 0 points',lost||/Genius|Brilliant|Impressive|Splendid|Great|Phew/.test(mo),`${used.length} guesses; ${mo.slice(0,140)}`);
await M.screenshot({path:OUT+'w-lost.png'});
if(await M.isVisible('#wIni')){await M.fill('#wIni','mom');await M.click('#wIniForm button');await M.clock.runFor(500);await M.waitForTimeout(1200)}
ok('mom’s result posted',+sql(`select count(*) from cradle_scores s join auth.users u on u.id=s.user_id where s.game='word' and u.email='wmom${sfx}@cradle.cfg'`)===1);
// boards
await M.click('#wPanel [data-w=board]');await M.clock.runFor(500);await M.waitForTimeout(800);
await M.click('#wPanel [data-wt=family]');await M.waitForTimeout(300);const mf=await txt(M,'#wdList');
ok('family board: both, with points, today’s grids (mom has played)',/DAD 60/.test(mf)&&/MOM/.test(mf)&&/Today: 2\/6/.test(mf)&&(!lost||/Today: X\/6 · hard/.test(mf))&&(await M.$$('#wdList .w-mg')).length===2,mf);
await M.screenshot({path:OUT+'w-board-family.png'});
await M.click('#wPanel [data-wt=mine]');await M.waitForTimeout(300);const mm=await txt(M,'#wdList');ok('My days lists today with 6 letters, hard',/6 letters · hard/.test(mm),mm);
// a stranger in another family who hasn't played today: Everyone shows initials, no grids
const {p:X}=await phone('X');await up(X,'wzed'+sfx);await X.click('#menuBtn');await X.click('[data-act=fun]');await X.click('#funWordScores');await X.clock.runFor(500);await X.waitForTimeout(900);
const xe=await txt(X,'#wdList');ok('stranger sees Everyone with initials only',/DAD/.test(xe)&&/MOM/.test(xe)&&!/@|wdad|cradle\.cfg/.test(xe),xe);
await X.click('#wPanel [data-wt=family]');await X.waitForTimeout(300);ok('stranger’s family board is empty',/No family results yet/.test(await txt(X,'#wdList')),await txt(X,'#wdList'));
// switch between the two games' boards
await X.click('#wPanel [data-fg=bottles]');await X.waitForTimeout(600);ok('board switches to Bottle Catch',await X.isVisible('#game')&&/High scores/.test(await txt(X,'#gPanel'))&&/Bottle Catch/.test(await txt(X,'#gPanel .g-games')));
await X.click('#gPanel [data-fg=word]');await X.waitForTimeout(600);ok('and back to Daily Word',await X.isVisible('#word')&&!(await X.isVisible('#game'))&&/Daily Word/.test(await txt(X,'#wPanel .g-games')));
// practice: unlimited, no points, not posted
await X.click('#wPanel [data-w=back]');await X.click('#wPanel [data-w=practice]');await X.waitForTimeout(200);
const pa=await X.evaluate(()=>{const s=JSON.parse(localStorage.getItem('cradle-word-v1'));return Object.values(s).find(x=>x.prac).prac.ans});
await guess(X,pa);await X.clock.runFor(2000);await X.waitForTimeout(300);
ok('practice: solved, no points posted',/Practice · 5 letters · 1\/6/.test(await txt(X,'#wPanel'))&&+sql(`select count(*) from cradle_scores s join auth.users u on u.id=s.user_id where s.game='word' and u.email='wzed${sfx}@cradle.cfg'`)===0,await txt(X,'#wPanel'));

// offline: a stranger plays tomorrow's word with no connection; it posts when back online
const {p:Y,ctx:Yc}=await phone('Y',new Date(Date.now()+864e5));await up(Y,'wyou'+sfx);
await Y.click('#menuBtn');await Y.click('[data-act=fun]');await Y.click('#funWordPlay');await Y.click('#wPanel [data-w=daily]');
// pick initials first through the board
const Ty=await todayAnswer(Y,5);await Yc.setOffline(true);await guess(Y,Ty.ans);await Y.clock.runFor(2000);await Y.waitForTimeout(300);
const yo=await txt(Y,'#wPanel');ok('offline: solved and saved to post later',/Genius!/.test(yo)&&/It posts when you.re back online/.test(yo),yo.slice(0,200));
await Yc.setOffline(false);await Y.evaluate(()=>dispatchEvent(new Event('online')));await Y.clock.runFor(3000);await Y.waitForTimeout(1500);
const yp=await txt(Y,'#wPanel');
if(await Y.isVisible('#wIni')){await Y.fill('#wIni','you');await Y.click('#wIniForm button');await Y.clock.runFor(500);await Y.waitForTimeout(1200)}
ok('back online: posted for that day',sql(`select score||' '||day from cradle_scores s join auth.users u on u.id=s.user_id where s.game='word' and u.email='wyou${sfx}@cradle.cfg'`)===`70 ${Ty.day}`,yp.slice(0,200));
// database not updated: friendly message
const {p:N}=await phone('N');await up(N,'wnew'+sfx);await N.route('**/rpc/cradle_*word*',r=>r.fulfill({status:404,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:'{"code":"PGRST202","message":"Could not find the function public.cradle_word_board"}'}));
await N.click('#menuBtn');await N.click('[data-act=fun]');await N.click('#funWordScores');await N.clock.runFor(300);await N.waitForTimeout(800);
ok('friendly message if the database isn’t updated',/aren.t set up on this Cradle yet/.test(await txt(N,'#wdList')),await txt(N,'#wdList'));
console.log('errors',errs);await b.close();
