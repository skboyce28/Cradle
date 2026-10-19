import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-full.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone({w=390,h=844,data=DEMO}={}){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,acceptDownloads:true,permissions:['clipboard-read','clipboard-write'],...(w<600?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'}:{})});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();if(d){const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S))}localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>window.print=()=>{});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+extra:''));



const S_=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const feedById=(S,id)=>Object.values(S.days).flatMap(d=>d.feeds).find(f=>f.id===id);
let p=await phone();
await p.click('#logNow');await p.clock.runFor(300);
const row=p.locator('.feed').filter({has:p.locator('input[type=time][value="14:40"]')}).first();
const id=await row.getAttribute('data-id');
ok('no slider for a new feed',await row.locator('.c-split').isHidden());
await row.locator('.side[data-side=L]').click();ok('no slider with one side',await row.locator('.c-split').isHidden());
await row.locator('.side[data-side=R]').click();ok('slider appears when both sides are on',await row.locator('.c-split').isVisible());
ok('starts at 50/50 in percent',(await txt(p,`.feed[data-id="${id}"] .c-split`))==='Left 50% 50% Right',await txt(p,`.feed[data-id="${id}"] .c-split`));
await row.locator('input[data-k=mins]').fill('20');await p.clock.runFor(200);
ok('switches to minutes once minutes are entered',(await txt(p,`.feed[data-id="${id}"] .c-split`))==='Left 10 min 10 min Right',await txt(p,`.feed[data-id="${id}"] .c-split`));
await row.locator('input[data-k=split]').focus();await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');await p.clock.runFor(200);
ok('dragging toward Left gives Left more time',(await txt(p,`.feed[data-id="${id}"] .c-split`))==='Left 12 min 8 min Right',await txt(p,`.feed[data-id="${id}"] .c-split`));
ok('saved as 60% left',feedById(await S_(p),id).split===60);
// with minutes, the slider moves a minute at a time, so a 30-minute feed can be 20/10 or 10/20 (10 left used to be impossible)
const slide=async v=>{await row.locator('input[data-k=split]').evaluate((i,v)=>{i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))},v);await p.clock.runFor(200);return txt(p,`.feed[data-id="${id}"] .c-split`)};
await row.locator('input[data-k=mins]').fill('30');await p.clock.runFor(200);
ok('slider steps are whole minutes (0 to 30)',await row.locator('input[data-k=split]').evaluate(i=>i.min+'/'+i.max+'/'+i.step+'/'+i.value)==='0/30/1/12');
const s1=await slide(10),f1=feedById(await S_(p),id);ok('20 left and 10 right',s1==='Left 20 min 10 min Right'&&Math.round(30*f1.split/100)===20,s1+' '+f1.split);
const s2=await slide(20),f2=feedById(await S_(p),id);ok('10 left and 20 right, the other way round',s2==='Left 10 min 20 min Right'&&Math.round(30*f2.split/100)===10,s2+' '+f2.split);
let all=true;for(let r=0;r<=30;r++){const t=await slide(r);if(t!==`Left ${30-r} min ${r} min Right`){all=false;break}}ok('every whole-minute split of 30 is possible',all);
await row.locator('input[data-k=mins]').fill('20');await p.clock.runFor(200);await slide(8);
ok('back to 20 minutes, 12 left and 8 right',feedById(await S_(p),id).split===60&&(await txt(p,`.feed[data-id="${id}"] .c-split`))==='Left 12 min 8 min Right');
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/s-split-mobile.png'});
await row.locator('.side[data-side=R]').click();ok('slider hides when back to one side',await row.locator('.c-split').isHidden());
await row.locator('.side[data-side=R]').click();ok('comes back with the same split',(await txt(p,`.feed[data-id="${id}"] .c-split`))==='Left 12 min 8 min Right');
// timer adds minutes -> labels follow
await row.locator('[data-timer]').click();await p.clock.runFor(5*60e3);await row.locator('[data-timer]').click().catch(async()=>{await p.locator(`.feed[data-id="${id}"] [data-timer]`).click()});await p.clock.runFor(300);
ok('timer minutes update the split labels',(await txt(p,`.feed[data-id="${id}"] .c-split`))==='Left 15 min 10 min Right',await txt(p,`.feed[data-id="${id}"] .c-split`));
// dashboard
await p.click('#tabs [data-tab=dash]');await p.clock.runFor(400);
const sb=await txt(p,'#sideBal');ok('side balance shows nursing time by side',/Nursing time on each side/.test(sb)&&/Left \d+h? ?\d*m?/.test(sb),sb.slice(sb.indexOf('Nursing time')));
const ins=await txt(p,'#insights');ok('insight about the time split',/⚖️ Nursing time split \d+% left and \d+% right/.test(ins),(ins.match(/⚖️[^.]*\./)||[''])[0]);
// chart explorer, today by feed
await p.click('.chartbox >> nth=0');await p.clock.runFor(300);
const tb=await p.innerText('#cmTable');ok('feed table shows the split',/L\+R\s+L15\/R10/.test(tb),tb.split('\n').find(l=>/2:40/.test(l)));
await p.click(`#cmTable tr[data-sel="${id}"]`);await p.clock.runFor(200);ok('feed details show the split',/Split L 15 min · R 10 min/i.test(await txt(p,'#cmSel')),await txt(p,'#cmSel'));
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
// doctor report
await p.click('[data-report]');await p.clock.runFor(1000);const rep=(await p.evaluate(()=>document.getElementById('print').textContent)).replace(/\s+/g,' ');
ok('doctor report shows the side split',/Nursing: \d+ min\/day \(left \d+%, right \d+%\)/.test(rep),(rep.match(/Nursing:.{0,40}/)||[''])[0]);
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
// print sheet
await p.click('#tabs [data-tab=today]');await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Print sheet/i.test(x.textContent));b&&b.click()});await p.clock.runFor(1000);
await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
const ps=(await p.evaluate(()=>[...document.querySelectorAll('#print td')].map(e=>e.textContent).join(' | ')));ok('print sheet shows minutes per side',/25 \(L15\/R10\)/.test(ps));
// night shift on the newest feed
await p.click('#nightBtn');await p.clock.runFor(800);
ok('Night shift shows the slider',await p.isVisible('#night .nsplit'),await txt(p,'#night .nsplit').catch(()=>''));
await p.focus('#night [data-n=split]');await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.clock.runFor(200);
ok('Night shift slider moves time to the right, a minute at a time',/L 12 min.*13 min R/.test(await txt(p,'#night .nsplit'))&&feedById(await S_(p),id).split===48,await txt(p,'#night .nsplit'));
await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/s-split-night.png'});
await p.click('#night [data-n=R]');await p.clock.runFor(200);ok('Night shift hides it with one side',!(await p.isVisible('#night .nsplit')));
await p.click('#night [data-n=R]');await p.clock.runFor(200);await p.click('#night [data-n=exit]');
// export -> import keeps split
await p.click('#menuBtn');await p.click('[data-act=data]');await p.click('[data-dm=export]');await p.clock.runFor(300);
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('text=Download file')]);const file=await dl.path();
const ex=JSON.parse(fs.readFileSync(file,'utf8'));ok('export keeps the split',Object.values(ex.days).flatMap(d=>d.feeds).find(f=>f.id===id).split===48);
const q=await phone({data:JSON.stringify({settings:{theme:'light',v2:1},baseVersion:99,days:{}})});
await q.setInputFiles('#fileIn',file);await q.clock.runFor(500);await q.click('#impReplace');await q.click('#askOk');await q.clock.runFor(400);
ok('import keeps the split',feedById(await S_(q),id).split===48);
const oldOne=Object.values((await S_(q)).days).flatMap(d=>d.feeds).find(f=>f.left&&f.right&&f.id!==id&&f.id!=='demo999');ok('older both-sides feeds count as 50/50 (no split stored)',oldOne&&oldOne.split===undefined);
const d=await phone({w:1280,h:860});await d.click('#logNow');await d.clock.runFor(200);const r2=d.locator('.feed').last();
await d.evaluate(()=>{const r=[...document.querySelectorAll('.feed')].pop();r.querySelector('.side[data-side=L]').click();r.querySelector('.side[data-side=R]').click();r.scrollIntoView({block:'center'})});await d.clock.runFor(300);await d.screenshot({path:(process.env.CRADLE_OUT||'out')+'/s-split-desktop.png'});
ok('no sideways scroll on phone',!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
console.log('errors',errs);await b.close();
