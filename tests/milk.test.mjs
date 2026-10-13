// Milk storage: adding to the freezer and fridge, CDC age flags, thawing, freezing, using a bag as a
// bottle feed, undo, labels (typed, found, scanned, and printed as Code 128), syncing to another phone,
// and export.
import { chromium } from 'playwright';import { execSync } from 'child_process';import fs from 'fs';
const KEY='sb_publishable_testkey_1234567890',DB='http://localhost:54321',OUT=(process.env.CRADLE_OUT||'out')+'/';
const sql=q=>execSync(`psql "${process.env.DATABASE_URL}" -A -t -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EMPTY=JSON.stringify({settings:{theme:'light',v2:1,babyName:'Juniper'},baseVersion:99,days:{}});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
// a pretend camera and barcode reader, so the Scan button can be tested (Chrome on a computer has neither)
const FAKE_SCAN=()=>{window.BarcodeDetector=class{async detect(){return window.__scan?[{rawValue:window.__scan,format:'code_128'}]:[]}};
  navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d').fillRect(0,0,64,48);return c.captureStream(5)}};
async function phone(n,scan){const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:UA,hasTouch:true});if(scan)await ctx.addInitScript(FAKE_SCAN);
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));
  await p.clock.install({time:new Date()});await p.goto(process.env.CRADLE_APP);await p.evaluate(e=>{localStorage.clear();localStorage.setItem('cradle-feeding-v1',e)},EMPTY);await p.reload();return p}
const closeModals=p=>p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const settle=async p=>{for(let i=0;i<3;i++){await p.evaluate(()=>dispatchEvent(new Event('online')));await p.clock.runFor(500);await p.waitForTimeout(600)}await closeModals(p)};
async function up(p,u,key=''){await p.clock.runFor(1500);await p.waitForSelector('#gLogin:not(.hidden)');if(await p.isHidden('#gDb'))await p.click('#gDbOpen');await p.fill('#gUrl',DB);await p.fill('#gKey',KEY);
  await p.click('#gMode');await p.fill('#gUser',u);await p.fill('#gPass','longenough1');await p.fill('#gPass2','longenough1');await p.fill('#gShare',key);await p.click('#gGo');await p.waitForTimeout(1200);await settle(p)}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const dkey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const ago=days=>dkey(new Date(Date.now()-days*864e5));
// a moment `mins` minutes ago, as the form's date and time (so “today” entries are never in the future, whatever time the tests run)
const rec=mins=>{const d=new Date(Date.now()-mins*60e3);return {date:dkey(d),time:String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}};
const openMilk=async p=>{await p.click('#menuBtn');await p.click('#dd [data-milk]');await p.waitForTimeout(300)};
async function add(p,{date,time='09:00',ml,unit='ml',place='freezer',box='bag',count=1,code='',note=''}){
  await p.click(`#mkUnit [data-mku=${unit}]`);await p.fill('#mkDate',date);await p.fill('#mkTime',time);await p.fill('#mkMl',String(ml));await p.click(`#mkPlace [data-mp=${place}]`);await p.selectOption('#mkBox',box);
  await p.fill('#mkCount',String(count));await p.fill('#mkCode',code);await p.fill('#mkNote',note);await p.click('#mkAdd');await p.waitForTimeout(250)}
const rows=p=>p.$$eval('#mkList .mkrow',rs=>rs.map(r=>({id:r.dataset.mkid,t:r.innerText.replace(/\s+/g,' '),lvl:(r.className.match(/lvl-(\w+)/)||[])[1],sec:r.closest('.wlist').previousElementSibling.textContent})));
const row=async(p,f)=>(await rows(p)).find(f);
const sfx=Date.now()%100000;

const P=await phone('A',true);await up(P,'amilk'+sfx);
// menu
await P.click('#menuBtn');
const items=await P.$$eval('#dd .item:not(.hidden)',bs=>bs.map(b=>b.textContent.trim()));
ok('menu has Milk storage after Weights',items.findIndex(t=>/Milk storage/.test(t))===items.findIndex(t=>/Weights/.test(t))+1);
ok('Guide and About share a row, so the menu still fits',await P.evaluate(()=>{const g=document.querySelector('#dd [data-act=help]').getBoundingClientRect(),a=document.querySelector('#dd [data-act=about]').getBoundingClientRect();return Math.abs(g.top-a.top)<2})&&await P.evaluate(()=>document.getElementById('dd').scrollHeight)<644);
await P.click('#menuBtn');
await openMilk(P);
ok('starts empty',/Nothing stored yet/.test(await txt(P,'#mkList'))&&/Freezer Empty/.test(await txt(P,'#mkStats')));
ok('amount box: number keyboard, with an mL / oz switch that starts on oz (weights are in lb)',await P.$eval('#mkMl',i=>i.inputMode)==='decimal'&&await P.$eval('#mkUnit [data-mku=oz]',b=>b.classList.contains('on'))&&(await P.getAttribute('#mkMl','placeholder')).startsWith('oz'));
ok('scan buttons show where the browser can scan',await P.isVisible('#mkScan')&&await P.isVisible('#mkCodeScan'));

// add: 3 bags to the freezer, an old one, and two fridge bags (one in oz)
await add(P,{date:ago(10),ml:120,count:3,note:'Morning pump'});
let st=await S(P);ok('3 bags saved to the freezer',st.milk.length===3&&st.milk.every(m=>m.place==='freezer'&&m.ml===120&&m.box==='bag'&&m.at===ago(10)+'T09:00'),JSON.stringify(st.milk[0]));
await add(P,{date:ago(220),ml:150,box:'bottle'});
await add(P,{date:ago(5),ml:'3 oz',place:'fridge'});
await add(P,{...rec(120),ml:100,place:'fridge',code:'ABC123'});
st=await S(P);ok('typing “3 oz” still works',st.milk.some(m=>m.ml===89&&m.place==='fridge'));
await add(P,{...rec(180),ml:4,unit:'oz',place:'fridge'});st=await S(P);const oz4=st.milk.find(m=>m.ml===118);
ok('with oz picked, a plain 4 is 4 oz (118 mL), and oz is remembered',!!oz4&&st.ui.milkUnit==='oz'&&await P.$eval('#mkUnit [data-mku=oz]',b=>b.classList.contains('on')));
await P.click(`[data-mkid="${oz4.id}"] [data-mk=edit]`);await P.waitForTimeout(200);ok('editing shows it in oz',(await P.inputValue('#mkMl'))==='4');
await P.click('#mkUnit [data-mku=ml]');ok('switching to mL converts what’s in the box',(await P.inputValue('#mkMl'))==='118');
await P.click('#mkDel');await P.click('#askOk');await P.waitForTimeout(200);
ok('totals: freezer 4 containers, 510 mL',/Freezer 510 mL · 17\.2 oz 4 containers/.test(await txt(P,'#mkStats')),await txt(P,'#mkStats'));
let r=await rows(P);
const old=r.find(x=>/150 mL/.test(x.t));ok('7-month-old frozen milk: use soon, and it’s first',old&&old.lvl==='soon'&&/past 6 months/.test(old.t)&&/Use first/.test(old.t)&&r.filter(x=>/Freezer/.test(x.sec))[0].id===old.id,old&&old.t);
const f5=r.find(x=>/89 mL/.test(x.t));ok('5 days in the fridge is past the CDC limit',f5&&f5.lvl==='old'&&/Over 4 days/.test(f5.t));
const fresh=r.find(x=>/ABC123/.test(x.t));ok('fresh fridge milk: use or freeze by a date 4 days on',fresh&&fresh.lvl==='ok'&&/Use or freeze by/.test(fresh.t));
const ten=r.find(x=>/120 mL/.test(x.t));ok('10-day-old frozen milk is fine, with a best-by date',ten&&ten.lvl==='ok'&&/best by/.test(ten.t));
await P.screenshot({path:OUT+'milk-list.png',fullPage:false});

// rules
await add(P,{...rec(30),ml:60,place:'fridge',code:'abc123'});ok('a label already in storage asks first',/already has the label abc123/.test(await txt(P,'#askMsg')));
await P.click('#askCancel');await P.waitForTimeout(150);ok('…and Cancel doesn’t save it',(await S(P)).milk.length===6&&await P.isVisible('#milkModal'));
await P.fill('#mkCount','1');await P.fill('#mkCode','');
await add(P,{date:ago(-2),ml:60});ok('a time in the future is refused',/in the future/.test(await txt(P,'#toast')));
await P.click(`[data-mkid="${f5.id}"] [data-mk=freeze]`);ok('milk over 4 days in the fridge can’t be frozen',/too long to freeze/.test(await txt(P,'#toast')));

// fridge → freezer, then thaw, then use as a bottle feed
await P.click(`[data-mkid="${fresh.id}"] [data-mk=freeze]`);await P.waitForTimeout(150);
st=await S(P);ok('Freeze moves fresh milk to the freezer',st.milk.find(m=>m.id===fresh.id).place==='freezer'&&!!st.milk.find(m=>m.id===fresh.id).frozenAt);
await P.click(`[data-mkid="${old.id}"] [data-mk=thaw]`);await P.waitForTimeout(150);
r=await rows(P);const th=r.find(x=>x.id===old.id);ok('Thaw: a Thawed section with a 24-hour use-by',th&&/Thawed/.test(th.sec)&&/use by tomorrow/.test(th.t)&&!/Freeze/.test(th.t),th&&th.t);
await P.click(`[data-mkid="${old.id}"] [data-mk=use]`);await P.waitForTimeout(150);
ok('Use asks how',await P.isVisible('#mkUseModal')&&/150 mL/.test(await txt(P,'#mkUseS')));
await P.click('#mkUseModal [data-mu=fed]');await P.waitForTimeout(400);
st=await S(P);const used=st.milk.find(m=>m.id===old.id),fd=st.days[dkey(new Date())]?.feeds.find(f=>f.id===used.done?.feed);
ok('it’s logged as a bottle feed today, and leaves storage',used.done&&used.done.how==='fed'&&fd&&fd.bottle===150&&!(await P.isVisible('#milkModal'))&&await P.isVisible(`.feed[data-id="${fd.id}"]`));
await openMilk(P);ok('Recently used shows it',/Recently used \(1\)/.test(await txt(P,'#mkList'))&&!(await rows(P)).some(x=>x.id===old.id));
await P.click('#mkList details summary');await P.click(`.mkdone [data-mkid="${old.id}"] [data-mk=undo]`);await P.waitForTimeout(150);
ok('Undo puts it back (the feed stays)',(await rows(P)).some(x=>x.id===old.id)&&/feed stays/.test(await txt(P,'#toast')));
await P.click(`[data-mkid="${f5.id}"] [data-mk=use]`);ok('old milk gets a throw-it-out note',await P.isVisible('#mkUseOld'));await P.click('#mkUseModal [data-mu=discard]');await P.waitForTimeout(150);
ok('Throw it away',(await S(P)).milk.find(m=>m.id===f5.id).done.how==='discard');

// labels: find, unknown label, scan, edit, print
await P.fill('#mkFind','abc');await P.waitForTimeout(100);ok('typing filters by label',(await rows(P)).length===1);
await P.fill('#mkFind','');await P.type('#mkFind','ZZZ999');await P.press('#mkFind','Enter');await P.waitForTimeout(300);
ok('an unknown label starts a new container with it',(await P.inputValue('#mkCode'))==='ZZZ999'&&/New label ZZZ999/.test(await txt(P,'#toast')));
await P.evaluate(()=>{window.__scan='ABC123'});await P.click('#mkScan');await P.waitForTimeout(800);await P.clock.runFor(600);
ok('Scan finds the container',!(await P.isVisible('#scanner'))&&/Found ABC123/.test(await txt(P,'#toast'))&&(await rows(P)).length===1);
await P.fill('#mkFind','');await P.dispatchEvent('#mkFind','input');
await P.evaluate(()=>{window.__scan='LBL-777'});await P.click('#mkCodeScan');await P.waitForTimeout(800);await P.clock.runFor(600);
ok('the 📷 next to Label scans into the box',(await P.inputValue('#mkCode'))==='LBL-777');await P.fill('#mkCode','');
await P.click(`[data-mkid="${ten.id}"] [data-mk=edit]`);await P.waitForTimeout(300);
ok('Edit fills the form',(await P.inputValue('#mkMl'))==='120'&&await P.isVisible('#mkDel')&&await P.isVisible('#mkOneLabel'));
await P.fill('#mkMl','130');await P.fill('#mkCode','BAG-1');await P.click('#mkAdd');await P.waitForTimeout(200);
st=await S(P);ok('edit saved',st.milk.find(m=>m.id===ten.id).ml===130&&st.milk.find(m=>m.id===ten.id).code==='BAG-1');
await P.evaluate(()=>{window.print=()=>{dispatchEvent(new Event('beforeprint'))}});
await P.click('#mkPrint');await P.waitForTimeout(150);
ok('Print labels asks which kind, for the ones without a label, starting on the 40 × 14 label printer',await P.isVisible('#mkLblModal')&&/Labels for the 3 containers without one/.test(await txt(P,'#mkLblWhat'))&&await P.isChecked('#mkLblModal input[value=p21]'),await txt(P,'#mkLblWhat'));
await P.check('#mkLblModal input[value=sheet]');await P.click('#mkLblGo');await P.waitForTimeout(400);
const lbl=await P.$$eval('#print .mklbl',ls=>ls.map(l=>({code:l.querySelector('.lc').textContent,bars:l.querySelectorAll('.c128 rect').length,w:+l.querySelector('.c128').getAttribute('viewBox').split(' ')[2]})));
st=await S(P);
ok('labels made: CM-xxxxx codes saved on each container, with barcodes',lbl.length===3&&lbl.every(l=>/^CM-[A-Z2-9]{5}$/.test(l.code)&&st.milk.some(m=>m.code===l.code))&&lbl.every(l=>l.w===20+11*(l.code.length+2)+13&&l.bars===3*(l.code.length+2)+4),JSON.stringify(lbl));
ok('printing uses the label sheet',await P.evaluate(()=>document.body.classList.contains('print-labels')));
await P.evaluate(()=>dispatchEvent(new Event('afterprint')));await P.screenshot({path:OUT+'milk-labels.png'});
// a known label: BAG-1 is start B, 5 characters, a check character, and stop = 7 symbols, 25 bars
await P.click(`[data-mkid="${ten.id}"] [data-mk=edit]`);await P.waitForTimeout(200);await P.click('#mkOneLabel');await P.waitForTimeout(150);
ok('the sheet choice is remembered',await P.isChecked('#mkLblModal input[value=sheet]')&&/One label, for 130 mL/.test(await txt(P,'#mkLblWhat')));await P.click('#mkLblGo');await P.waitForTimeout(300);
const one=await P.$eval('#print .mklbl .c128',s=>({n:s.querySelectorAll('rect').length,w:s.getAttribute('viewBox').split(' ')[2],first:s.querySelector('rect').getAttribute('width')}));
ok('Code 128 for BAG-1: start B (2-wide bar first), 25 bars, 90 modules',one.n===25&&one.first==='2'&&+one.w===20+7*11+13,JSON.stringify(one));
await P.evaluate(()=>dispatchEvent(new Event('afterprint')));await P.click('#mkCancel');
// 40 x 14 mm pictures for a label printer's app
await P.click(`[data-mkid="${ten.id}"] [data-mk=edit]`);await P.waitForTimeout(200);await P.click('#mkOneLabel');await P.check('#mkLblModal input[value=p21]');await P.click('#mkLblGo');await P.waitForTimeout(600);
const im=await P.$$eval('#mkImgGrid img',is=>is.map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:i.src.slice(0,22)})));
ok('label printer: a 960 × 336 picture (40 × 14 mm) with a download link',im.length===1&&im[0].w===960&&im[0].h===336&&im[0].src==='data:image/png;base64,'&&await P.isVisible('#mkImgGrid a[download="cradle-label-BAG-1.png"]'),JSON.stringify(im));
fs.writeFileSync(OUT+'milk-p21.png',Buffer.from((await P.$eval('#mkImgGrid img',i=>i.src)).split(',')[1],'base64'));
await P.screenshot({path:OUT+'milk-p21-modal.png'});await P.click('#mkImgModal [data-close]');await P.waitForTimeout(150);ok('Done goes back to Milk storage',await P.isVisible('#milkModal'));await P.click('#mkCancel');
// a label written like the NIIMBOT template gives the date and time
await P.fill('#mkFind','');await P.type('#mkFind','10/10/2026 - 8 A');await P.press('#mkFind','Enter');await P.waitForTimeout(300);
ok('a new label like “10/10/2026 - 8 A” fills in Oct 10, 8:00am',(await P.inputValue('#mkCode'))==='10/10/2026 - 8 A'&&(await P.inputValue('#mkDate'))==='2026-10-10'&&(await P.inputValue('#mkTime'))==='08:00'&&/came from the label/.test(await txt(P,'#toast')));
await P.fill('#mkCode','10/9/26 7:30 PM');await P.dispatchEvent('#mkCode','change');ok('…and “10/9/26 7:30 PM” too',(await P.inputValue('#mkDate'))==='2026-10-09'&&(await P.inputValue('#mkTime'))==='19:30');
await P.click('#mkUnit [data-mku=ml]');await P.fill('#mkMl','100');await P.fill('#mkCount','2');await P.click('#mkAdd');await P.waitForTimeout(200);
ok('several containers pumped together can share that label',(await S(P)).milk.filter(m=>m.code==='10/9/26 7:30 PM').length===2);
// syncs to another phone in the family; the menu shows the stash
await settle(P);
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='amilk${sfx}@cradle.cfg'`);
const Q=await phone('B');await up(Q,'bmilk'+sfx,famKey);await settle(Q);
const sq=await S(Q);ok('the other phone gets the same storage',sq.milk.length===(await S(P)).milk.length&&sq.milk.some(m=>m.code==='BAG-1'&&m.ml===130));
await Q.click('#menuBtn');ok('menu shows the amount stored',/Milk storage\s*\d+\.\d oz/.test(await txt(Q,'#dd')),await txt(Q,'#dd [data-milk]'));await Q.click('#menuBtn');
await openMilk(Q);const qr=await rows(Q);const qa=qr.find(x=>/BAG-1/.test(x.t));
await Q.click(`[data-mkid="${qa.id}"] [data-mk=thaw]`);await Q.waitForTimeout(200);await settle(Q);await settle(P);
ok('a change on one phone reaches the other',(await S(P)).milk.find(m=>m.code==='BAG-1').place==='thawed');
// export carries it
await closeModals(P);await P.click('#menuBtn');await P.click('[data-act=data]');await P.click('[data-dm=export]');await P.clock.runFor(300);
const [dl]=await Promise.all([P.waitForEvent('download'),P.click('text=Download file')]);const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
ok('export includes milk storage',Array.isArray(ex.milk)&&ex.milk.length===(await S(P)).milk.length&&ex.milk.some(m=>m.code==='BAG-1'));
console.log('errors',errs);await b.close();
