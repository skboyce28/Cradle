import { chromium } from 'playwright';import { execSync } from 'child_process';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
async function phone(n){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>localStorage.setItem('cradle-feeding-v1',e),EMPTY);await p.reload();return p}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async(p,close=true)=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}if(close)await closeModals(p)};
async function up(p,u,key=''){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.fill('#gShare',key);await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
const S_=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const feeds=s=>Object.values(s.days).flatMap(d=>d.feeds);
const server=id=>JSON.parse(sql(`select data from cradle_items where id='feed:${id}'`)||'{}');
const sfx=Date.now()%100000;

const A=await phone('A');await up(A,'mdad'+sfx);
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='mdad${sfx}@cradle.cfg'`);
const B=await phone('B');await up(B,'mmom'+sfx,famKey);
await A.click('#logNow');await A.waitForTimeout(100);await settle(A);await settle(B);
const id=feeds(await S_(A))[0].id;ok('both phones have the new feed',feeds(await S_(B)).some(f=>f.id===id));
const row=p=>`.feed[data-id="${id}"]`;

// 1. different fields edited on both phones before either syncs
await A.fill(row()+' input[data-k=bottle]','40');await B.fill(row()+' input[data-k=note]','burped well');
await settle(A);await settle(B);await settle(A);
let sv=server(id),fa=feeds(await S_(A)).find(f=>f.id===id),fb=feeds(await S_(B)).find(f=>f.id===id);
ok('server keeps both edits',sv.bottle===40&&sv.note==='burped well',JSON.stringify({b:sv.bottle,n:sv.note}));
ok('phone A has both edits',fa.bottle===40&&fa.note==='burped well');
ok('phone B has both edits',fb.bottle===40&&fb.note==='burped well');
ok('A shows B’s bottle and note on screen',(await A.inputValue(row()+' input[data-k=note]'))==='burped well');

// 2. same field on both phones: they end up agreeing
await A.fill(row()+' input[data-k=pump]','50');await B.fill(row()+' input[data-k=pump]','55');
await settle(A);await settle(B);await settle(A);
sv=server(id);fa=feeds(await S_(A)).find(f=>f.id===id);fb=feeds(await S_(B)).find(f=>f.id===id);
ok('same field: both phones agree with the server',sv.pump===fa.pump&&fa.pump===fb.pump,`server ${sv.pump} A ${fa.pump} B ${fb.pump}`);

// 3. buttons and fields mixed: A taps L + wet, B types minutes
await A.click(row()+' .side[data-side=L]');await A.click(row()+' .c-dia .chk.wet');await B.fill(row()+' input[data-k=mins]','18');
await settle(A);await settle(B);await settle(A);
sv=server(id);ok('taps on one phone and typing on the other both survive',sv.left===true&&sv.urine===true&&sv.mins===18,JSON.stringify({l:sv.left,u:sv.urine,m:sv.mins}));

// 4. typing on A while B's change arrives
await A.click(row()+' input[data-k=note]');await A.keyboard.press('End');await A.keyboard.type(' then slept');
await B.fill(row()+' input[data-k=bottle]','45');await settle(B);
await A.evaluate(()=>dispatchEvent(new Event('online')));await A.clock.runFor(400);await A.waitForTimeout(900);
const t4=await txt(A,'#toast');
ok('while typing, other boxes update',(await A.inputValue(row()+' input[data-k=bottle]'))==='45',await A.inputValue(row()+' input[data-k=bottle]'));
ok('while typing, the box being typed in is left alone',(await A.inputValue(row()+' input[data-k=note]'))==='burped well then slept'&&await A.evaluate(()=>document.activeElement.dataset.k==='note'));
ok('toast says who changed what',/Mmom\d+ updated a feed( at [\d:]+[ap]m)?/.test(t4),t4);
ok('changed row flashes',await A.evaluate(id=>document.querySelector(`.feed[data-id="${id}"]`).classList.contains('flash'),id));
await A.keyboard.press('Tab');await settle(A);await settle(B);
sv=server(id);ok('after typing, server has the note and B’s bottle',sv.note==='burped well then slept'&&sv.bottle===45,JSON.stringify({n:sv.note,b:sv.bottle}));
ok('B sees A’s note',(await B.inputValue(row()+' input[data-k=note]'))==='burped well then slept');

// 5. delete on A while B edits: delete wins
await A.click('#logNow');await A.waitForTimeout(100);await settle(A);await settle(B);
const id2=feeds(await S_(A)).find(f=>f.id!==id).id;
ok('a row added elsewhere appears even while typing on this phone',await B.isVisible(`.feed[data-id="${id2}"]`)&&await B.evaluate(()=>document.activeElement&&document.activeElement.tagName==='INPUT'));
ok('rows stay in time order',await B.evaluate(()=>{const t=[...document.querySelectorAll('#feeds .feed input[data-k=time]')].map(i=>i.value||'99');return t.join()===[...t].sort().join()}));
await B.fill(`.feed[data-id="${id2}"] input[data-k=bottle]`,'30');await settle(B);
await A.click(`.feed[data-id="${id2}"] .del`);await A.click('#askOk');await A.waitForTimeout(200);
await settle(A);await settle(B);
ok('a delete removes the entry on both phones',!feeds(await S_(A)).some(f=>f.id===id2)&&!feeds(await S_(B)).some(f=>f.id===id2));

// 6. own changes don't toast
await A.evaluate(()=>document.getElementById('toast').textContent='');await A.fill(row()+' input[data-k=pump]','60');await settle(A);
ok('no toast for your own changes',!/updated/.test(await txt(A,'#toast')),await txt(A,'#toast'));

// 7. weights: add, review, edit
await A.click('#tabs [data-tab=dash]');await A.waitForTimeout(200);
await A.click('#dash [data-addweight=add]').catch(async()=>{await A.click('[data-addweight=add]')});await A.waitForTimeout(200);
ok('+ Add weight puts the cursor in the weight box',await A.evaluate(()=>document.activeElement.id==='wVal'));
await A.fill('#wVal','7 lb 2 oz');await A.click('#wAdd');await A.waitForTimeout(150);
ok('weight shows in the list at the top',/7 lb 2\.0 oz/.test(await txt(A,'#wList')));
await A.click('#wList [data-wedit]');await A.waitForTimeout(300);
ok('Edit fills the form',(await A.inputValue('#wVal'))==='7 lb 2.0 oz'&&/Edit weight/i.test(await txt(A,'#wFormTitle'))&&await A.isVisible('#wCancel'));
ok('row being edited is highlighted',await A.isVisible('#wList .wrow.editing'));
await A.fill('#wVal','7 lb 4 oz');await A.fill('#wNote','Pediatrician visit');await A.click('#wAdd');await A.waitForTimeout(150);
let ws=(await S_(A)).weights;
ok('edit changes the same weight, not a new one',ws.length===1&&Math.abs(ws[0].g-3289)<3&&ws[0].note==='Pediatrician visit',JSON.stringify(ws));
ok('list shows the new value and form resets',/7 lb 4\.0 oz/.test(await txt(A,'#wList'))&&!/7 lb 2\.0/.test(await txt(A,'#wList'))&&/Add a weight/i.test(await txt(A,'#wFormTitle')));
await A.click('#wList [data-wedit]');await A.click('#wCancel');ok('Cancel edit goes back to adding',/Add a weight/i.test(await txt(A,'#wFormTitle'))&&(await A.inputValue('#wVal'))==='');
await A.screenshot({path:(process.env.CRADLE_OUT||'out')+'/w-modal.png'});
await closeModals(A);await settle(A);await settle(B);
ws=(await S_(B)).weights||[];ok('edited weight syncs to the other phone',ws.length===1&&Math.abs(ws[0].g-3289)<3,JSON.stringify(ws));
await A.waitForTimeout(100);ok('dashboard has See all',await A.isVisible('[data-addweight=list]'));
await A.click('[data-addweight=list]');await A.waitForTimeout(200);ok('See all opens the list without focusing the form',await A.evaluate(()=>document.activeElement.id!=='wVal')&&/7 lb 4\.0 oz/.test(await txt(A,'#wList')));
// birth weight row links to Settings
await closeModals(A);await A.evaluate(()=>{});
await A.click('#menuBtn');await A.click('[data-act=settings]').catch(()=>{});await A.waitForTimeout(200);
if(await A.isVisible('#settingsModal')){await A.fill('#sBirth','2026-09-27');await A.fill('#sBW','7 lb 6 oz');await A.click('#settingsModal .primary');await A.waitForTimeout(200);await closeModals(A)}
await A.click('[data-addweight=list]');await A.waitForTimeout(200);
if(await A.isVisible('#wList [data-wgo=birth]')){await A.click('#wList [data-wgo=birth]');await A.waitForTimeout(200);ok('birth weight row opens Settings',await A.isVisible('#settingsModal'))}else ok('birth weight row opens Settings',false,await txt(A,'#wList'));
await closeModals(A);
console.log('errors',errs);await b.close();
