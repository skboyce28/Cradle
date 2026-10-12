// Weight entry in grams or pounds and ounces: weighted feeds, the Weights screen, and birth weight
import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const txt=async(p,s)=>(await p.innerText(s)).replace(/\s+/g,' ').trim();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-09T14:40:00')});
await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});
  if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});
  if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
await p.goto(process.env.CRADLE_APP);
await p.evaluate(([d,c])=>{localStorage.clear();const S=JSON.parse(d);S.settings.weightUnit='lb';localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));localStorage.setItem('cradle-cloud-v1',c)},[DEMO,CL]);
await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const S=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const fid=await p.$eval('.feed:not(.bathrow)',r=>r.dataset.id);
const feed=async()=>(await S()).days['2026-10-09'].feeds.find(f=>f.id===fid);
const R=`.feed[data-id="${fid}"]`;

// weighted feed in pounds and ounces
await p.click(`${R} .chk[data-t=wf] >> visible=true`);await p.waitForTimeout(200);
ok('weighted feed shows lb and oz boxes, and the cursor goes to Before',await p.isVisible(`${R} .wt[data-k=wPre] [data-w=lb]`)&&await p.isVisible(`${R} .wt[data-k=wPre] [data-w=oz]`)&&await p.evaluate(r=>!!document.activeElement.closest(r+' .wt[data-k=wPre]'),R));
ok('number keyboard on the boxes',await p.$eval(`${R} .wt[data-k=wPre] [data-w=lb]`,i=>i.inputMode)==='numeric'&&await p.$eval(`${R} .wt[data-k=wPre] [data-w=oz]`,i=>i.inputMode)==='decimal');
const put=async(sel,v)=>{await p.fill(sel,v);await p.press(sel,'Tab');await p.waitForTimeout(80)};
await put(`${R} .wt[data-k=wPre] [data-w=lb]`,'7');await put(`${R} .wt[data-k=wPre] [data-w=oz]`,'2');
await put(`${R} .wt[data-k=wPost] [data-w=lb]`,'7');await put(`${R} .wt[data-k=wPost] [data-w=oz]`,'3.5');
let f=await feed();
ok('saved in grams: 7 lb 2 oz and 7 lb 3.5 oz',f.wPre===3232&&f.wPost===3274,`${f.wPre} ${f.wPost}`);
ok('transfer shown in oz',/Transferred about 42 mL \(\+1\.5 oz\)/.test(await txt(p,`${R} .wfres`)),await txt(p,`${R} .wfres`));
await p.screenshot({path:OUT+'wt-lboz.png'});
// switch to grams: the same weights, now in grams
await p.click(`${R} .wtu [data-wu=g]`);await p.waitForTimeout(200);
ok('g switch shows the same weights in grams',(await p.inputValue(`${R} .wt[data-k=wPre] [data-w=g]`))==='3232'&&(await p.inputValue(`${R} .wt[data-k=wPost] [data-w=g]`))==='3274'&&(await S()).settings.weightUnit==='g');
ok('transfer now in grams',/Transferred about 42 mL \(\+42 g\)/.test(await txt(p,`${R} .wfres`)),await txt(p,`${R} .wfres`));
await put(`${R} .wt[data-k=wPost] [data-w=g]`,'3300');f=await feed();ok('grams typed are saved as grams',f.wPost===3300&&/about 68 mL/.test(await txt(p,`${R} .wfres`)));
await put(`${R} .wt[data-k=wPost] [data-w=g]`,'3.31');f=await feed();ok('a small number in grams is read as kilograms (3.31 → 3310 g)',f.wPost===3310,String(f.wPost));
await put(`${R} .wt[data-k=wPost] [data-w=g]`,'abc');await p.clock.runFor(100);f=await feed();ok('something that isn’t a number is refused',f.wPost===3310&&/Enter the weight like 3250 g/.test(await txt(p,'#toast')),await txt(p,'#toast'));
await p.screenshot({path:OUT+'wt-g.png'});
// back to lb oz
await p.click(`${R} .wtu [data-wu=lb]`);await p.waitForTimeout(200);
ok('lb oz switch converts back',(await p.inputValue(`${R} .wt[data-k=wPre] [data-w=lb]`))==='7'&&(await p.inputValue(`${R} .wt[data-k=wPre] [data-w=oz]`))==='2');

// Weights screen
await p.click('#menuBtn');await p.click('#dd [data-addweight]');await p.waitForTimeout(300);
ok('Weights form has lb and oz boxes and the switch',await p.isVisible('#wVal [data-w=lb]')&&await p.isVisible('#wUnitSw .wtu'));
await p.fill('#wVal [data-w=lb]','8');await p.fill('#wVal [data-w=oz]','1.5');
await p.click('#wUnitSw [data-wu=g]');await p.waitForTimeout(150);
ok('switching units keeps what you typed (8 lb 1.5 oz = 3671 g)',(await p.inputValue('#wVal [data-w=g]'))==='3671',await p.inputValue('#wVal [data-w=g]'));
await p.fill('#wVal [data-w=g]','3700');await p.click('#wAdd');await p.waitForTimeout(200);
const ws=(await S()).weights;ok('weight saved in grams and listed in grams',ws.some(w=>w.g===3700)&&/3,700 g/.test(await txt(p,'#wList')),JSON.stringify(ws.map(w=>w.g)));
await p.fill('#wVal [data-w=g]','90000');await p.click('#wAdd');await p.clock.runFor(100);ok('an impossible weight is refused',/looks off/.test(await txt(p,'#toast')));
await p.screenshot({path:OUT+'wt-modal.png'});
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));

// Settings: birth weight follows Show weights in
await p.click('#menuBtn');await p.click('[data-act=settings]');await p.waitForTimeout(200);
const bw0=(await S()).settings.birthWeight;
ok('birth weight in grams boxes',await p.isVisible('#sBW [data-w=g]')&&(await p.inputValue('#sBW [data-w=g]'))===String(Math.round(bw0)),String(bw0));
await p.selectOption('#sWU','lb');await p.waitForTimeout(100);
ok('changing Show weights in redraws it in lb and oz',await p.isVisible('#sBW [data-w=lb]')&&(await p.inputValue('#sBW [data-w=lb]'))!=='');
await p.fill('#sBW [data-w=lb]','7');await p.fill('#sBW [data-w=oz]','6');await p.click('#settingsModal .primary');await p.waitForTimeout(200);
const st=(await S()).settings;ok('saved: 7 lb 6 oz and lb units',st.birthWeight===3345&&st.weightUnit==='lb',`${st.birthWeight} ${st.weightUnit}`);
console.log('errors',errs);await b.close();
