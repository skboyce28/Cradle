// Support: sending feedback (with a screenshot), the admin Feedback inbox (status and reply), people
// seeing the reply, the Quality Assurance and Compliance Officer achievements, and the database's limits.
import { chromium } from 'playwright';import { execSync } from 'child_process';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+String(x).replace(/\s+/g,' ').slice(0,240):''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return p}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function up(p,u){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);
  await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
const openSup=async p=>{await closeModals(p);await p.click('#menuBtn');await p.click('#dd [data-act=support]');await p.waitForTimeout(900)};
async function pngBytes(p){return Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=1600;const x=c.getContext('2d');x.fillStyle='#e07a48';x.fillRect(0,0,900,1600);x.fillStyle='#24406b';x.fillRect(100,300,700,400);return c.toDataURL('image/png').split(',')[1]}),'base64')}
const sfx=Date.now()%100000,U='afb'+sfx,ADM='zadmin'+sfx;

// a parent sends a bug with a screenshot
const P=await phone('user');await up(P,U);
await P.click('#menuBtn');ok('Support sits in the menu next to Guide and About',await P.isVisible('#dd .itemrow [data-act=support]'));await P.click('#menuBtn');
await openSup(P);
ok('three kinds, Bug to start, and what gets sent along',(await P.$$('#supKind [data-sk]')).length===3&&await P.$eval('#supKind [data-sk=bug]',x=>x.classList.contains('on'))&&/Sent with it: Cradle v\d+\.\d+ · Android · Chrome/.test(await txt(P,'#supInfo')),await txt(P,'#supInfo'));
ok('nothing sent yet, and it explains the achievements',/Quality Assurance and Compliance Officer/.test(await txt(P,'#supList')));
await P.fill('#supBody','hi');await P.click('#supSend');await P.clock.runFor(300);ok('too short is refused',/Tell us a little more/.test(await txt(P,'#toast')));
await P.fill('#supBody','The tummy time timer kept running after I closed the app.\nSteps: start it, close Cradle, reopen.');
await P.setInputFiles('#supFile',{name:'shot.png',mimeType:'image/png',buffer:await pngBytes(P)});await P.waitForTimeout(800);
ok('screenshot is shrunk and previewed',await P.isVisible('#supShot img'));
await P.screenshot({path:OUT+'support-form.png'});
await P.click('#supSend');await P.waitForTimeout(900);await P.clock.runFor(300);
ok('sent: thanks, and it shows as New',/Thanks! Your feedback was sent/.test(await txt(P,'#toast'))&&/New/.test(await txt(P,'#supList'))&&/tummy time timer/.test(await txt(P,'#supList'))&&(await P.inputValue('#supBody'))==='');
const row=sql(`select kind||'|'||status||'|'||app_version||'|'||left(device,7)||'|'||left(screenshot,23)||'|'||(length(screenshot)<400000)::text||'|'||(household_id is not null)::text from cradle_feedback f join auth.users u on u.id=f.user_id where u.email='${U}@cradle.cfg'`);
ok('saved with kind, version, device, a JPEG screenshot under the limit, and the family',/^bug\|new\|\d+\.\d+\|Android\|data:image\/jpeg;base64,\|true\|true$/.test(row),row);
await P.click('#supKind [data-sk=idea]');ok('kinds switch, with a matching prompt',/What would you like Cradle to do/.test(await P.getAttribute('#supBody','placeholder')));
await P.fill('#supBody','A night light mode for the dashboard.');await P.click('#supSend');await P.waitForTimeout(900);
ok('a second one (an idea) is listed too',(await P.$$('#supList .fbitem')).length===2);
ok('no inbox for someone who isn’t an admin',!(await P.isVisible('#supInboxBtn')));
await closeModals(P);

// the admin reviews it in the app
const A=await phone('admin');await up(A,ADM);
sql(`insert into cradle_admins(user_id) select id from auth.users where email='${ADM}@cradle.cfg' on conflict do nothing`);
await A.reload();await A.clock.runFor(2500);await A.waitForTimeout(1500);await settle(A);
const nNew=+sql(`select count(*) from cradle_feedback where status='new'`);
await A.click('#menuBtn');ok('admin: Support shows how many are new',(await txt(A,'#ddSup'))===String(nNew),await txt(A,'#ddSup')+' vs '+nNew);await A.click('#menuBtn');
await openSup(A);ok('admin: Feedback inbox button with the count',new RegExp('Feedback inbox \\('+nNew+' new\\)').test(await txt(A,'#supAdmin')));
await A.click('#supInboxBtn');await A.waitForTimeout(900);
const card=`#inboxList .fbitem:has-text("tummy time timer")`;
ok('inbox: the bug, who sent it, their family, version and device',await A.isVisible(card)&&new RegExp('From '+U+' · .*family · v\\d+\\.\\d+ · Android · Chrome').test(await txt(A,card+' .sub')),await txt(A,card+' .sub'));
await A.click(card+' [data-loadshot]');await A.waitForTimeout(700);ok('inbox: the screenshot loads on request',await A.isVisible(card+' .fbshot img'));
await A.screenshot({path:OUT+'support-inbox.png'});
await A.fill(card+' [data-reply]','Thanks! Fixed in the next version.');await A.click(card+' [data-setst=used]');await A.waitForTimeout(900);
ok('inbox: marked Used with a reply',/Saved: Used/.test(await txt(A,'#toast'))&&sql(`select status||'|'||reply||'|'||(reviewed_at is not null)::text from cradle_feedback where body like 'The tummy time timer%' and user_id=(select id from auth.users where email='${U}@cradle.cfg')`)==='used|Thanks! Fixed in the next version.|true');
await A.click('#inboxFilter [data-if=used]');await A.waitForTimeout(200);ok('inbox: filter by status',await A.isVisible(card));
await A.click('#inboxFilter [data-if=new]');await A.waitForTimeout(200);ok('…and it left New',!(await A.isVisible(card)));

// the parent sees the reply and earns Quality Assurance
await P.reload();await P.clock.runFor(2500);await P.waitForTimeout(1500);await settle(P);
await P.click('#menuBtn');ok('the parent’s menu shows an update',(await txt(P,'#ddSup'))==='1',await txt(P,'#ddSup'));await P.click('#menuBtn');
await openSup(P);ok('they see Used and the reply',/Used/.test(await txt(P,'#supList'))&&/Reply: Thanks! Fixed in the next version\./.test(await txt(P,'#supList')));
await closeModals(P);await P.click('#menuBtn');ok('the update mark clears once seen',(await txt(P,'#ddSup'))==='');await P.click('#menuBtn');
await P.click('#menuBtn');await P.click('[data-act=ach]');await P.waitForTimeout(400);
const ach=await P.$$eval('#achGrid .ach',as=>as.map(a=>({n:a.querySelector('b').firstChild.textContent.trim(),on:a.classList.contains('on'),m:a.querySelector('.meta').textContent})));
const qa=ach.find(a=>a.n==='Quality Assurance'),co=ach.find(a=>a.n==='Compliance Officer');
ok('Quality Assurance earned; Compliance Officer 1 of 5',qa&&qa.on&&co&&!co.on&&/1 of 5/.test(co.m),JSON.stringify([qa,co]));
await closeModals(P);
// four more reviewed: Compliance Officer
const uid=sql(`select id from auth.users where email='${U}@cradle.cfg'`);
sql(`insert into cradle_feedback(user_id,kind,body,status,reviewed_at) select '${uid}','idea','Idea number '||g,'reviewed',now() from generate_series(1,4) g`);
await openSup(P);await closeModals(P);await P.click('#menuBtn');await P.click('[data-act=ach]');await P.waitForTimeout(400);
ok('five reviewed: Compliance Officer earned',await P.$$eval('#achGrid .ach.on b',bs=>bs.some(b=>/Compliance Officer/.test(b.textContent))));
await closeModals(P);

// the database's limits
const asU=q=>{try{return sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}"}',false); ${q}`)}catch(e){return String(e.stderr||e.message)}};
ok('someone who isn’t an admin can’t open the inbox or change a status',/Only Cradle admins/.test(asU(`select cradle_feedback_inbox(null)`))&&/Only Cradle admins/.test(asU(`select cradle_feedback_review(gen_random_uuid(),'used',null)`)));
ok('the app can’t read the table directly',/permission denied/.test(asU(`select * from cradle_feedback`))||asU(`select count(*) from cradle_feedback`).split('\n').pop()==='0');
ok('refuses a screenshot that isn’t an image',/too large or isn.t an image/.test(asU(`select cradle_submit_feedback('bug','x y z','data:text/html;base64,PHNjcmlwdD4=')`)));
for(let i=0;i<8;i++)asU(`select cradle_submit_feedback('question','Question number ${i}')`);
ok('10 a day at most',/That.s 10 today/.test(asU(`select cradle_submit_feedback('question','One too many')`)));
console.log('errors',errs);await b.close();
