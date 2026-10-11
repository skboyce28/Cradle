import { chromium } from 'playwright';import { execSync } from 'child_process';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>localStorage.setItem('cradle-feeding-v1',e),EMPTY);await p.reload();return {p,ctx}}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function up(p,u,key=''){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.fill('#gShare',key);await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
// play a round holding the thumb at x; returns the end panel text
async function playRound(p,x=195){await p.click('#gPanel [data-g=play]');await p.mouse.move(x,600);await p.mouse.down();
  for(let i=0;i<130;i++){await p.clock.runFor(1000);if(await p.evaluate(()=>!!document.querySelector('#gPanel:not(.hidden) .g-big')))break;if(i%4===0)await p.mouse.move(60+((i*37)%270),600)}
  await p.mouse.up();await p.waitForTimeout(800);return txt(p,'#gPanel')}
const sfx=Date.now()%100000;
sql('delete from cradle_scores');  // start from an empty board (test database only)

const {p:A}=await phone('A');await up(A,'gdad'+sfx);
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='gdad${sfx}@cradle.cfg'`);
await A.click('#menuBtn');ok('menu has Fun center under Learning center',/Learning center\s*\n?\s*🎮?\s*Fun center/.test(await A.innerText('#dd'))||(await txt(A,'#dd')).indexOf('Learning center')<(await txt(A,'#dd')).indexOf('Fun center'));
await A.click('[data-act=fun]');await A.waitForTimeout(200);ok('Fun center shows Bottle Catch',/Bottle Catch/.test(await txt(A,'#funModal'))&&/Your best: --/.test(await txt(A,'#funModal')));
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-fun.png'});
await A.click('#funPlay');await A.waitForTimeout(200);ok('start screen with how-to and toggles',/Catch bottles: \+10/.test(await txt(A,'#gPanel'))&&/Buzz on Sound off/.test(await txt(A,'#gPanel')));
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-start.png'});
await A.click('#gPanel [data-g=play]');await A.clock.runFor(5000);
ok('round running: timer counts down',/^1:5[45]$/.test(await txt(A,'#gTime')),await txt(A,'#gTime'));
await A.mouse.move(195,600);await A.mouse.down();for(let i=0;i<3;i++){await A.clock.runFor(1000)}await A.mouse.up();
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-play.png'});
await A.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
ok('auto-pause when switching away',/Paused/.test(await txt(A,'#gPanel')));
await A.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
const t1=await txt(A,'#gTime');await A.clock.runFor(3000);ok('clock frozen while paused',(await txt(A,'#gTime'))===t1);
await A.click('#gPanel [data-g=resume]');await A.clock.runFor(2000);ok('resume continues',(await txt(A,'#gTime'))!==t1);
// rounds until one scores; enter initials when asked
const scoreOf=t=>+((t.match(/(Time!|Out of hearts) ([\d,]+)/)||[])[2]||'0').replace(/,/g,'');
let lastPost=0;
async function scoringRound(p,x,ini){
  for(let a=0;a<8;a++){
    const wait=10500-(Date.now()-lastPost);if(wait>0)await p.waitForTimeout(wait);
    if(!(await p.isVisible('#gPanel [data-g=play]'))){await p.click('#gPanel [data-g=back]').catch(()=>{})}
    const e=await playRound(p,x+a*17);const sc=scoreOf(e);
    if(sc>0){if(await p.isVisible('#gIni')){await p.fill('#gIni',ini);await p.click('#gIniForm button')}await p.waitForTimeout(1300);lastPost=Date.now();return {sc,post:await txt(p,'#gPost'),end:e}}
  }return {sc:0,post:'',end:''}}
// finish the paused round first
for(let i=0;i<130;i++){await A.clock.runFor(1000);if(await A.evaluate(()=>!!document.querySelector('#gPanel:not(.hidden) .g-big')))break}
await A.waitForTimeout(500);ok('round ends with a score panel',/Time!|Out of hearts/.test(await txt(A,'#gPanel')));await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-over.png'});
if(await A.isVisible('#gIni')){await A.fill('#gIni','ass');await A.click('#gIniForm button');await A.waitForTimeout(900);ok('rejects blocked initials',/Please pick different initials/.test(await txt(A,'#gPost')),await txt(A,'#gPost'));}
let r1=await scoringRound(A,150,'tst');ok('first posted score asks for initials, then posts',/Posted! You're #\d+ on Everyone/.test(r1.post),r1.post+' score '+r1.sc);
ok('score in database',sql(`select initials||' '||score from cradle_scores order by id desc limit 1`)===`TST ${r1.sc}`);
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-over.png'});
let r2=await scoringRound(A,90,'xxx');ok('next round posts without asking',/Posted/.test(r2.post)&&!(await A.isVisible('#gIni')),r2.post);
await A.click('#gPanel [data-g=board]');await A.waitForTimeout(900);let bd=await txt(A,'#gList');ok('Everyone board lists TST',/TST/.test(bd),bd);await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-board.png'});
// wife joins the family, stranger in another family
const {p:W}=await phone('W');await up(W,'gmom'+sfx,famKey);await W.click('#menuBtn');await W.click('[data-act=fun]');await W.click('#funPlay');
const rw=await scoringRound(W,250,'mom');ok('family member posts',/Posted/.test(rw.post),rw.post);
const {p:X}=await phone('X');await up(X,'gzed'+sfx);await X.click('#menuBtn');await X.click('[data-act=fun]');await X.click('#funPlay');
const rx=await scoringRound(X,300,'zed');ok('another family posts',/Posted/.test(rx.post),rx.post);
await X.click('#gPanel [data-g=board]');await X.waitForTimeout(900);
const xe=await txt(X,'#gList');await X.click('#gPanel [data-gt=family]');const xf=await txt(X,'#gList');
ok('stranger sees everyone (initials only)',/TST/.test(xe)&&/MOM/.test(xe)&&/ZED/.test(xe)&&!/@|gdad/.test(xe),xe);
ok('stranger family board is only their own',/ZED/.test(xf)&&!/TST|MOM/.test(xf),xf);
await A.click('#gPanel [data-g=board]').catch(()=>{});await A.waitForTimeout(400);await A.click('#gPanel [data-gt=everyone]');await A.waitForTimeout(400);
await A.evaluate(()=>{});await A.click('#gPanel [data-g=back]').catch(()=>{});await A.click('#gPanel [data-g=board]');await A.waitForTimeout(900);
await A.click('#gPanel [data-gt=family]');const af=await txt(A,'#gList');ok('your family board: you and your partner, not others',/TST/.test(af)&&/MOM/.test(af)&&!/ZED/.test(af),af);
await A.click('#gPanel [data-gt=mine]');const am=await txt(A,'#gList');ok('My best lists your scores',(am.match(/TST/g)||[]).length>=2,am);
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-board-mine.png'});
// change initials
await A.click('#gMe [data-g=ini]');await A.fill('#gIniB','dad');await A.click('#gIni2 button');await A.waitForTimeout(900);
ok('change initials updates the board',/DAD/.test(await txt(A,'#gList'))&&!/TST/.test(await txt(A,'#gList'))&&/Playing as DAD/.test(await txt(A,'#gMe')));
// offline round: queued then posted
await A.click('#gPanel [data-g=back]').catch(()=>{});await A.context().setOffline(true);
let so=0;for(let a=0;a<8&&!so;a++){const e=await playRound(A,110+a*23);so=scoreOf(e)}
ok('offline round is saved',so>0&&/Saved\. It posts when you.re back online/.test(await txt(A,'#gPost')),await txt(A,'#gPost'));
const before=+sql(`select count(*) from cradle_scores where initials='DAD'`);await A.waitForTimeout(Math.max(0,10500-(Date.now()-lastPost)));
await A.context().setOffline(false);await A.evaluate(()=>dispatchEvent(new Event('online')));await A.clock.runFor(2000);await A.waitForTimeout(2000);
ok('posts once back online',+sql(`select count(*) from cradle_scores where initials='DAD'`)===before+1,`${before} -> ${sql(`select count(*) from cradle_scores where initials='DAD'`)}`);
// database not updated yet: friendly message
const {p:N,ctx:Nc}=await phone('N');await up(N,'gnew'+sfx);await N.route('**/rpc/cradle_*score*',r=>r.fulfill({status:404,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:'{"code":"PGRST202","message":"Could not find the function public.cradle_scores_board"}'}));
await N.click('#menuBtn');await N.click('[data-act=fun]');await N.click('#funScores');await N.waitForTimeout(800);
ok('friendly message if the database isn’t updated',/aren.t set up on this Cradle yet/.test(await txt(N,'#gList')));
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/g-final.png'});
console.log('errors',errs);await b.close();
