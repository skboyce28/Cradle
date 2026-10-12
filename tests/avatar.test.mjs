// Profile pictures (built-in and uploaded, with who-can-see-it) and the Night shift button
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
// a 40x30 PNG (made in the page) to upload like a photo from the camera roll
async function pngBytes(p){return Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=30;const x=c.getContext('2d');x.fillStyle='#e07a48';x.fillRect(0,0,40,30);x.fillStyle='#24406b';x.fillRect(10,5,20,20);return c.toDataURL('image/png').split(',')[1]}),'base64')}
const famPics=async p=>p.$$eval('#famBody .wrow',rs=>rs.map(r=>({who:r.querySelector('b')?.textContent||'',img:!!r.querySelector('.favatar img.pic'),svg:!!r.querySelector('.favatar svg.pic'),letter:(r.querySelector('.favatar .picl')||{}).textContent||''})));
const sfx=Date.now()%100000;

// Night shift: a button at the top, not a tab
const {p:A}=await phone('A');await up(A,'adad'+sfx);
ok('tabs are Log, Dashboard, History',(await A.$$eval('#tabs button',bs=>bs.map(b=>b.textContent.trim()))).join(',')==='Log,Dashboard,History');
ok('Night shift button sits next to the moon',await A.isVisible('#nightBtn')&&await A.evaluate(()=>{const n=document.getElementById('nightBtn').getBoundingClientRect(),c=document.getElementById('calmBtn').getBoundingClientRect();return Math.abs(n.top-c.top)<4&&n.right<=c.left+1}));
await A.click('#nightBtn');await A.clock.runFor(400);ok('the button opens Night shift',await A.isVisible('#night'));
await A.keyboard.press('Escape');await A.clock.runFor(300);ok('Escape closes it',!(await A.isVisible('#night')));
await A.screenshot({path:OUT+'av-header.png'});

// pick a built-in picture
await A.click('#menuBtn');ok('menu has Your picture',/Your picture/.test(await txt(A,'#dd')));
await A.click('#ddPic');await A.waitForTimeout(400);
ok('picker: upload, letter, and 7 built-in pictures; Me and my family to start',(await A.$$('#picGrid [data-pk]')).length===9&&await A.$eval('#picVis input[value=family]',i=>i.checked)&&await A.$eval('#picGrid [data-pk=default]',b=>b.classList.contains('on')));
await A.screenshot({path:OUT+'av-picker.png'});
await A.click('#picGrid [data-pk=bear]');await A.click('#picSave');await A.waitForTimeout(800);
ok('bear saved: profile button shows it',await A.isVisible('#menuBtn svg.pic')&&sql(`select kind||' '||preset||' '||visibility from cradle_profiles p join auth.users u on u.id=p.user_id where u.email='adad${sfx}@cradle.cfg'`)==='preset bear family');

// mom joins: sees dad's bear on the Family screen
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='adad${sfx}@cradle.cfg'`);
const {p:M}=await phone('M');await up(M,'amom'+sfx,famKey);
await M.click('#menuBtn');await M.click('[data-act=family]');await M.waitForTimeout(1500);
let fp=await famPics(M);const dadRow=()=>fp.find(r=>/adad/.test(r.who)),momRow=()=>fp.find(r=>/amom/.test(r.who));
ok('family screen: dad’s bear, mom’s letter',dadRow()&&dadRow().svg&&momRow()&&!momRow().svg&&momRow().letter==='A',JSON.stringify(fp));
await M.screenshot({path:OUT+'av-family.png'});await closeModals(M);

// dad uploads a photo just for himself
await A.click('#menuBtn');await A.click('#ddPic');await A.waitForTimeout(400);
await A.setInputFiles('#picFile',{name:'me.png',mimeType:'image/png',buffer:await pngBytes(A)});await A.waitForTimeout(600);
ok('photo is cropped and previewed',await A.isVisible('#picPrev img.pic')&&await A.$eval('#picGrid [data-pk=upload]',b=>b.classList.contains('on')));
await A.check('#picVis input[value=me]');await A.click('#picSave');await A.waitForTimeout(800);
const row=sql(`select kind||' '||visibility||' '||length(photo)||' '||left(photo,23) from cradle_profiles p join auth.users u on u.id=p.user_id where u.email='adad${sfx}@cradle.cfg'`);
ok('photo saved small, as a JPEG, only for dad',/^photo me \d+ data:image\/jpeg;base64,$/.test(row)&&+row.split(' ')[2]<16000,row);
ok('dad’s profile button shows his photo',await A.isVisible('#menuBtn img.pic'));
await A.reload();await A.clock.runFor(2500);await A.waitForTimeout(500);await closeModals(A);ok('still there after reopening Cradle',await A.isVisible('#menuBtn img.pic'));
await M.click('#menuBtn');await M.click('[data-act=family]');await M.waitForTimeout(1500);fp=await famPics(M);
ok('mom now sees the letter, not the photo',dadRow()&&!dadRow().img&&!dadRow().svg&&dadRow().letter==='A',JSON.stringify(fp));await closeModals(M);

// everyone: shows on the high-score boards to a stranger
await A.click('#menuBtn');await A.click('#ddPic');await A.waitForTimeout(500);await A.check('#picVis input[value=everyone]');
ok('a note says it shows on the boards',/high-score boards/.test(await txt(A,'#picNote')));await A.click('#picSave');await A.waitForTimeout(800);
sql(`insert into cradle_scores (user_id,game,initials,score,seconds) select id,'bottles','DAD',1234,100 from auth.users where email='adad${sfx}@cradle.cfg'`);
const {p:X}=await phone('X');await up(X,'azed'+sfx);await X.click('#menuBtn');await X.click('[data-act=fun]');await X.click('#funScores');await X.waitForTimeout(1200);
const xr=await X.$$eval('#gList li',ls=>ls.map(l=>({t:l.textContent,img:!!l.querySelector('.bpic img.pic')})));
ok('stranger sees dad’s photo next to DAD on Everyone',xr.some(r=>/DAD/.test(r.t)&&r.img),JSON.stringify(xr.map(r=>r.t+(r.img?' [img]':''))));
await X.screenshot({path:OUT+'av-board.png'});
// and back to family-only: the stranger no longer gets it
await A.click('#menuBtn');await A.click('#ddPic');await A.waitForTimeout(500);await A.check('#picVis input[value=family]');await A.click('#picSave');await A.waitForTimeout(800);
await X.click('#gPanel [data-g=back]');await X.click('#gPanel [data-g=board]');await X.waitForTimeout(1200);
ok('family-only: the stranger sees just initials',!(await X.$$eval('#gList li',ls=>ls.some(l=>/DAD/.test(l.textContent)&&l.querySelector('.bpic')))));
await M.click('#menuBtn');await M.click('[data-act=family]');await M.waitForTimeout(1500);fp=await famPics(M);ok('family-only: mom sees the photo',dadRow()&&dadRow().img,JSON.stringify(fp));await closeModals(M);
// back to the letter removes the stored photo
await A.click('#menuBtn');await A.click('#ddPic');await A.waitForTimeout(500);await A.click('#picGrid [data-pk=default]');await A.click('#picSave');await A.waitForTimeout(800);
ok('Letter removes the photo from the database',sql(`select kind||' '||coalesce(photo,'none') from cradle_profiles p join auth.users u on u.id=p.user_id where u.email='adad${sfx}@cradle.cfg'`)==='default none'&&!(await A.isVisible('#menuBtn .pic')));
// the database refuses anything that isn't a small image
const uid=sql(`select id from auth.users where email='azed${sfx}@cradle.cfg'`);
const asX=q=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('refuses something that isn’t an image',/too large or isn.t an image/.test(asX(`select cradle_set_profile('photo',null,'data:text/html;base64,PHNjcmlwdD4=','family')`)));
ok('refuses a photo that’s too big',/too large or isn.t an image/.test(asX(`select cradle_set_profile('photo',null,'data:image/jpeg;base64,'||repeat('A',20000),'family')`)));
ok('refuses an unknown picture',/Pick a picture/.test(asX(`select cradle_set_profile('preset','dragon',null,'family')`)));
ok('the app can’t read the table directly',/permission denied/.test(asX(`select * from cradle_profiles`))||asX(`select count(*) from cradle_profiles`).split('\n').pop()==='0');
console.log('errors',errs);await b.close();
