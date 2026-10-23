// Milk storage: adding to the freezer and fridge, CDC age flags, thawing, freezing, using a bag as a
// bottle feed, undo, labels (typed, found, scanned, and printed as Code 128), syncing to another phone,
// and export.
import { chromium } from 'playwright';import { execSync } from 'child_process';import fs from 'fs';import path from 'path';
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
// each stored container's row, and the section it's under (a row outside a section is a real problem: say where)
const rows=p=>p.$$eval('#mkList .mkrow',rs=>rs.map(r=>{const w=r.closest('.wlist'),h=w&&w.previousElementSibling;
  if(!h)throw new Error('milk row outside a section: '+(w?'list':'row')+' parent '+((w||r).parentElement||{}).outerHTML?.slice(0,600));
  return {id:r.dataset.mkid,t:r.innerText.replace(/\s+/g,' '),lvl:(r.className.match(/lvl-(\w+)/)||[])[1],sec:h.textContent}}));
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
ok('…with Undo on the message',/Moved to the freezer\s*Undo/.test(await txt(P,'#toast'))&&await P.isVisible('#toast .tact'));
await P.click('#toast .tact');await P.waitForTimeout(150);st=await S(P);
ok('Undo puts it back in the fridge',st.milk.find(m=>m.id===fresh.id).place==='fridge'&&!st.milk.find(m=>m.id===fresh.id).frozenAt&&/Back in the fridge/.test(await txt(P,'#toast')));
await P.click(`[data-mkid="${fresh.id}"] [data-mk=freeze]`);await P.waitForTimeout(150);
await P.click(`[data-mkid="${old.id}"] [data-mk=thaw]`);await P.waitForTimeout(150);
// thawed by mistake: Undo right away, or Undo thaw on the row later (which asks first)
ok('Thaw shows Undo on the message',/Thawing\..*Undo/.test(await txt(P,'#toast'))&&await P.isVisible('#toast .tact'));
await P.click('#toast .tact');await P.waitForTimeout(150);st=await S(P);
ok('Undo puts it straight back in the freezer',st.milk.find(m=>m.id===old.id).place==='freezer'&&!st.milk.find(m=>m.id===old.id).thawedAt&&/Back in the freezer/.test(await txt(P,'#toast')));
await P.click(`[data-mkid="${old.id}"] [data-mk=thaw]`);await P.waitForTimeout(150);await P.clock.runFor(20*60e3);await P.waitForTimeout(100);
ok('a thawed row has Undo thaw',await P.isVisible(`[data-mkid="${old.id}"] [data-mk=unthaw]`));
await P.click(`[data-mkid="${old.id}"] [data-mk=unthaw]`);await P.waitForTimeout(150);
ok('20 minutes later, Undo thaw asks first (thawed milk shouldn’t be refrozen)',await P.isVisible('#askModal')&&/Thaw was tapped by mistake/.test(await txt(P,'#askMsg'))&&(await txt(P,'#askCancel'))==='Keep it thawed');
await P.click('#askCancel');await P.waitForTimeout(150);ok('Keep it thawed leaves it thawed',(await S(P)).milk.find(m=>m.id===old.id).place==='thawed'&&await P.isVisible('#milkModal'));
await P.click(`[data-mkid="${old.id}"] [data-mk=unthaw]`);await P.waitForTimeout(150);await P.click('#askOk');await P.waitForTimeout(150);
ok('Back to freezer puts it back',(await S(P)).milk.find(m=>m.id===old.id).place==='freezer'&&await P.isVisible('#milkModal'));
await P.click(`[data-mkid="${old.id}"] [data-mk=thaw]`);await P.waitForTimeout(150);
r=await rows(P);const th=r.find(x=>x.id===old.id);ok('Thaw: a Thawed section with a 24-hour use-by',th&&/Thawed/.test(th.sec)&&/use by tomorrow/.test(th.t)&&!/Freeze/.test(th.t),th&&th.t);
await P.click(`[data-mkid="${old.id}"] [data-mk=use]`);await P.waitForTimeout(150);
ok('Use asks how',await P.isVisible('#mkUseModal')&&/150 mL/.test(await txt(P,'#mkUseS')));
await P.click('#mkUseModal [data-mu=fed]');await P.waitForTimeout(400);
st=await S(P);const used=st.milk.find(m=>m.id===old.id),pday=await P.evaluate(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}),fd=st.days[pday]?.feeds.find(f=>f.id===used.done?.feed);  // the page's today (its clock runs ahead of the test's near midnight)
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
const lbl=await P.$$eval('#print .mklbl',ls=>ls.map(l=>({code:l.querySelector('.lc').textContent,bars:l.querySelectorAll('.c128 rect').length,aria:l.querySelector('.c128').getAttribute('aria-label'),w:+l.querySelector('.c128').getAttribute('viewBox').split(' ')[2]})));
st=await S(P);
ok('labels made: CM-xxxxx codes saved on each container, with barcodes that carry just the 5 letters',lbl.length===3&&lbl.every(l=>/^CM-[A-Z2-9]{5}$/.test(l.code)&&st.milk.some(m=>m.code===l.code))&&lbl.every(l=>l.w===20+11*(5+2)+13&&l.bars===3*(5+2)+4&&l.aria==='Barcode '+l.code.slice(3)),JSON.stringify(lbl));
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
ok('the label printer tip says to print at 100% and turn the darkness down if bars run together',/Print at 100%, with no “fit” or scaling/.test(await txt(P,'#mkImgModal'))&&/darkness/.test(await txt(P,'#mkImgModal')));
// cleaner barcodes for thermal label printers, and Cradle's own barcode reader
const cm=lbl[0].code;
const geo=await P.evaluate(code=>{const d=cradleScan.label(code).getContext('2d').getImageData(0,160,960,1).data,runs=[];let cur=d[0]<128,len=0;
  for(let i=0;i<960;i++){const k=d[i*4]<128;if(k===cur)len++;else{runs.push([cur,len]);cur=k;len=1}}runs.push([cur,len]);return runs},cm);
const gBars=geo.filter(r=>r[0]).map(r=>r[1]),gGaps=geo.slice(1,-1).filter(r=>!r[0]).map(r=>r[1]);
ok('label printer barcode: CM-XXXXX carries just its 5 letters (25 bars), 3 printer dots a module, each bar a dot thinner, wide light gaps each side',
  gBars.length===25&&gBars.every(w=>(w+3)%9===0)&&Math.min(...gBars)===6&&gGaps.every(w=>(w-3)%9===0)&&Math.min(...gGaps)===12&&!geo[0][0]&&geo[0][1]>=72&&geo[geo.length-1][1]>=72,JSON.stringify(geo));
const reads=await P.evaluate(code=>{
  const shot=(c,{blur=1,flip=false,w=576}={})=>{const d=document.createElement('canvas');d.width=768;d.height=432;const x=d.getContext('2d');x.fillStyle='#aaa';x.fillRect(0,0,768,432);x.filter=`blur(${blur}px)`;x.translate(384,216);if(flip)x.rotate(Math.PI);x.drawImage(c,-w/2,-w*.175,w,w*.35);return cradleScan.read(x.getImageData(0,0,768,432))};
  const t=document.createElement('canvas');t.width=640;t.height=360;const tx=t.getContext('2d');tx.fillStyle='#fff';tx.fillRect(0,0,640,360);tx.fillStyle='#000';tx.font='bold 44px sans-serif';for(let y=60;y<360;y+=60)tx.fillText('Juniper · 120 mL · 4.1 oz',10,y);
  return {plain:shot(cradleScan.label(code)),blur:shot(cradleScan.label(code),{blur:2.5}),flip:shot(cradleScan.label(code),{flip:true}),small:shot(cradleScan.label(code),{w:360}),
    bag:shot(cradleScan.label('BAG-1')),date:shot(cradleScan.label('10/9/26 7:30 PM'),{w:760,blur:.5}),text:cradleScan.read(tx.getImageData(0,0,640,360))}},cm);
const all=(a,v)=>a.length>=2&&a.every(x=>x===v);
ok('Cradle’s own reader reads the label picture: sharp, blurry, upside down, and small',all(reads.plain,cm.slice(3))&&all(reads.blur,cm.slice(3))&&all(reads.flip,cm.slice(3))&&all(reads.small,cm.slice(3)),JSON.stringify(reads));
ok('…and labels with other text (BAG-1, a date), and reads nothing from plain text',all(reads.bag,'BAG-1')&&all(reads.date,'10/9/26 7:30 PM')&&reads.text.length===0,JSON.stringify(reads));
ok('Find by label says it takes typing or scanning',(await P.getAttribute('#mkFind','placeholder'))==='Type or scan a label, like CM-7KQ2M');
await P.fill('#mkFind','');await P.type('#mkFind',cm.slice(3).toLowerCase());await P.press('#mkFind','Enter');await P.waitForTimeout(300);
ok('typing just the 5 letters, in any case, finds CM-XXXXX',new RegExp('Found '+cm).test(await txt(P,'#toast'))&&(await rows(P)).length===1&&(await P.inputValue('#mkFind'))===cm,await txt(P,'#toast'));
await P.fill('#mkFind','');await P.dispatchEvent('#mkFind','input');
await P.evaluate(c=>{window.__scan=c},cm.slice(3));await P.click('#mkScan');await P.waitForTimeout(800);await P.clock.runFor(600);
ok('a scanned new-style label (just the 5 letters) finds CM-XXXXX',new RegExp('Found '+cm).test(await txt(P,'#toast')));
await P.evaluate(c=>{window.__scan=c},cm);await P.click('#mkScan');await P.waitForTimeout(800);await P.clock.runFor(600);
ok('…and an older label with the whole CM-XXXXX still does',new RegExp('Found '+cm).test(await txt(P,'#toast'))&&(await rows(P)).length===1);
await P.fill('#mkFind','');await P.dispatchEvent('#mkFind','input');
// a label written like the NIIMBOT template gives the date and time
await P.fill('#mkFind','');await P.type('#mkFind','10/10/2026 - 8 A');await P.press('#mkFind','Enter');await P.waitForTimeout(300);
ok('a new label like “10/10/2026 - 8 A” fills in Oct 10, 8:00am',(await P.inputValue('#mkCode'))==='10/10/2026 - 8 A'&&(await P.inputValue('#mkDate'))==='2026-10-10'&&(await P.inputValue('#mkTime'))==='08:00'&&/came from the label/.test(await txt(P,'#toast')));
await P.fill('#mkCode','10/9/26 7:30 PM');await P.dispatchEvent('#mkCode','change');ok('…and “10/9/26 7:30 PM” too',(await P.inputValue('#mkDate'))==='2026-10-09'&&(await P.inputValue('#mkTime'))==='19:30');
await P.click('#mkUnit [data-mku=ml]');await P.fill('#mkMl','100');await P.fill('#mkCount','2');await P.click('#mkAdd');await P.waitForTimeout(200);
ok('several containers pumped together can share that label',(await S(P)).milk.filter(m=>m.code==='10/9/26 7:30 PM').length===2);
// more than one pumping in a container, same day: one date, several times
await P.fill('#mkFind','');await P.dispatchEvent('#mkFind','input');
ok('the form has + Add a time, and no extra times to start',await P.isVisible('#mkAddTime')&&(await P.$$('#mkMore .mkxt')).length===0);
await P.click('#mkUnit [data-mku=ml]');await P.fill('#mkDate',ago(1));await P.fill('#mkTime','20:00');await P.click('#mkAddTime');await P.fill('#mkMore .mkxt','15:00');
ok('…which adds a time box (no date: it’s the same day)',(await P.$$('#mkMore .mkxt')).length===1&&(await P.$$('#mkMore input[type=date]')).length===0);
await P.fill('#mkMl','130');await P.click('#mkPlace [data-mp=fridge]');await P.fill('#mkCode','TWO-TIMES');await P.click('#mkAdd');await P.waitForTimeout(250);
let two=(await S(P)).milk.find(m=>m.code==='TWO-TIMES');
ok('saved with the first time as when it was pumped, and the later one kept (typed out of order)',two&&two.at===ago(1)+'T15:00'&&JSON.stringify(two.more)==='["20:00"]',JSON.stringify(two));
let tr=await row(P,x=>x.id===two.id);ok('the row shows both times',/Pumped .*3:00pm \+ 8:00pm/.test(tr.t),tr.t);
ok('its CDC limit counts from the first time',/Use or freeze by /.test(tr.t)&&/3:00pm/.test(tr.t.split('Use or freeze by ')[1]),tr.t);
ok('no + Add on fridge milk from yesterday',!(await P.isVisible(`[data-mkid="${two.id}"] [data-mk=addto]`)));
await P.click(`[data-mkid="${two.id}"] [data-mk=edit]`);await P.waitForTimeout(250);
ok('Edit shows the extra time',(await P.$$eval('#mkMore .mkxt',is=>is.map(i=>i.value))).join()==='20:00'&&(await P.inputValue('#mkTime'))==='15:00');
await P.click('#mkOneLabel');await P.check('#mkLblModal input[value=sheet]');await P.click('#mkLblGo');await P.waitForTimeout(300);
const d1=new Date(Date.now()-864e5),md=(d1.getMonth()+1)+'/'+d1.getDate();
const lt=await txt(P,'#print .mklbl .lt');ok('the label shows the times, short: '+md+' 3p + 8p',lt.includes('Pumped '+md+' 3p + 8p'),lt);
await P.evaluate(()=>dispatchEvent(new Event('afterprint')));
await P.click(`[data-mkid="${two.id}"] [data-mk=edit]`);await P.waitForTimeout(250);await P.click('#mkMore [data-mkxdel]');await P.click('#mkAdd');await P.waitForTimeout(250);
two=(await S(P)).milk.find(m=>m.code==='TWO-TIMES');ok('✕ removes a time',two.at===ago(1)+'T15:00'&&!('more' in two),JSON.stringify(two));
await P.click(`[data-mkid="${two.id}"] [data-mk=edit]`);await P.waitForTimeout(250);await P.click('#mkAddTime');await P.fill('#mkMore .mkxt','20:00');await P.click('#mkAdd');await P.waitForTimeout(250);
// + Add on today's fridge milk: the time and the amount go on the same container
await add(P,{...rec(30),ml:60,place:'fridge',code:'ADD-ME'});const am=(await S(P)).milk.find(m=>m.code==='ADD-ME');
ok('+ Add shows on fridge milk pumped today',await P.isVisible(`[data-mkid="${am.id}"] [data-mk=addto]`));
await P.click(`[data-mkid="${am.id}"] [data-mk=addto]`);await P.waitForTimeout(200);
ok('it asks for the time (now) and how much',await P.isVisible('#mkAddToModal')&&/60 mL/.test(await txt(P,'#mkAddToS'))&&/^\d\d:\d\d$/.test(await P.inputValue('#mkAddToTime')));
await P.click('#mkAddToGo');await P.waitForTimeout(150);ok('…and needs an amount',await P.isVisible('#mkAddToModal')&&/how much you’re adding/.test(await txt(P,'#toast')));
await P.fill('#mkAddToMl','50');await P.click('#mkAddToGo');await P.waitForTimeout(250);
const am2=(await S(P)).milk.find(m=>m.id===am.id);
ok('adding puts the amount and the time on the same container',am2.ml===110&&am2.at===am.at&&Array.isArray(am2.more)&&am2.more.length===1&&am2.more[0]>am.at.slice(11)&&await P.isVisible('#milkModal')&&/Added: now 110 mL/.test(await txt(P,'#toast')),JSON.stringify(am2)+' '+await txt(P,'#toast'));
// syncs to another phone in the family; the menu shows the stash
await settle(P);
const famKey=sql(`select join_code from cradle_households h join cradle_members m on m.household_id=h.id join auth.users u on u.id=m.user_id where u.email='amilk${sfx}@cradle.cfg'`);
const Q=await phone('B');await up(Q,'bmilk'+sfx,famKey);await settle(Q);
const sq=await S(Q);ok('the other phone gets the same storage',sq.milk.length===(await S(P)).milk.length&&sq.milk.some(m=>m.code==='BAG-1'&&m.ml===130)&&sq.milk.some(m=>m.code==='TWO-TIMES'&&JSON.stringify(m.more)==='["20:00"]'));
await Q.click('#menuBtn');ok('menu shows the amount stored',/Milk storage\s*\d+\.\d oz/.test(await txt(Q,'#dd')),await txt(Q,'#dd [data-milk]'));await Q.click('#menuBtn');
await openMilk(Q);const qr=await rows(Q);const qa=qr.find(x=>/BAG-1/.test(x.t));
await Q.click(`[data-mkid="${qa.id}"] [data-mk=thaw]`);await Q.waitForTimeout(200);await settle(Q);await settle(P);
ok('a change on one phone reaches the other',(await S(P)).milk.find(m=>m.code==='BAG-1').place==='thawed');
// export carries it
await closeModals(P);await P.click('#menuBtn');await P.click('[data-act=data]');await P.click('[data-dm=export]');await P.clock.runFor(300);
const [dl]=await Promise.all([P.waitForEvent('download'),P.click('text=Download file')]);const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
ok('export includes milk storage',Array.isArray(ex.milk)&&ex.milk.length===(await S(P)).milk.length&&ex.milk.some(m=>m.code==='BAG-1')&&ex.milk.some(m=>m.code==='TWO-TIMES'&&m.more&&m.more[0]==='20:00'));
// the 📷 Scan button on a phone whose browser has no barcode reader (an iPhone, say): a pretend camera
// shows the printed label, and Cradle reads the bars itself (signed in to the same account)
const y4m=path.resolve(OUT+'milk-scan.y4m'),VW=640,VH=480;
const gray=await P.evaluate(([code,W,H])=>{const d=document.createElement('canvas');d.width=W;d.height=H;const x=d.getContext('2d');x.fillStyle='#8f8f8f';x.fillRect(0,0,W,H);x.filter='blur(1px)';x.drawImage(cradleScan.label(code),50,150,540,189);
  const px=x.getImageData(0,0,W,H).data,g=[];for(let i=0;i<px.length;i+=4)g.push(px[i]);return g},[cm,VW,VH]);
const frame=Buffer.concat([Buffer.from('FRAME\n'),Buffer.from(gray),Buffer.alloc(VW*VH/2,128)]);
fs.writeFileSync(y4m,Buffer.concat([Buffer.from(`YUV4MPEG2 W${VW} H${VH} F10:1 Ip A1:1 C420jpeg\n`),frame,frame,frame]));
const bCam=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+y4m]});
const cctx=await bCam.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',hasTouch:true});
await cctx.addInitScript(()=>{delete window.BarcodeDetector});const C=await cctx.newPage();C.on('pageerror',e=>errs.push('C:'+e.message));
await C.goto(process.env.CRADLE_APP);await C.waitForSelector('#gLogin:not(.hidden)');if(await C.isHidden('#gDb'))await C.click('#gDbOpen');
await C.fill('#gUrl',DB);await C.fill('#gKey',KEY);await C.fill('#gUser','amilk'+sfx);await C.fill('#gPass','longenough1');await C.click('#gGo');
for(let i=0;i<30&&!((await S(C))?.milk||[]).some(m=>m.code===cm);i++){await C.evaluate(()=>dispatchEvent(new Event('online')));await C.waitForTimeout(500)}
await closeModals(C);
await openMilk(C);
ok('with no barcode reader in the browser, 📷 Scan still shows',!(await C.evaluate(()=>'BarcodeDetector' in window))&&await C.isVisible('#mkScan')&&await C.isVisible('#mkCodeScan'));
await C.click('#mkScan');await C.waitForTimeout(300);const cmsg=await txt(C,'#scanMsg');
let cfound=false;for(let i=0;i<40&&!cfound;i++){await C.waitForTimeout(250);cfound=new RegExp('Found '+cm).test(await txt(C,'#toast'))}
ok('…and Cradle reads the label from the camera itself and finds the container',cfound&&!(await C.isVisible('#scanner'))&&/hold it steady/.test(cmsg),cmsg+' | '+await txt(C,'#toast'));
await bCam.close();
console.log('errors',errs);await b.close();
