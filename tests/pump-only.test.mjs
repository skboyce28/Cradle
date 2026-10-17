// Pumping on its own isn't a feed (v1.40): a row with only a pump amount is labeled ⚡, isn't counted
// in the day's feeds, and doesn't reset "since last feed". Adding a bottle or a breast side to it makes it a feed.
import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-bath.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone(data=DEMO){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,acceptDownloads:true});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch','splash'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>{window.print=()=>{dispatchEvent(new Event('beforeprint'))};document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+String(extra).replace(/\s+/g,' ').slice(0,240):''));
const K='2026-10-09';
const p=await phone();
const feeds=async()=>+(await txt(p,'#stats')).match(/Feeds (\d+)/i)[1];
const f0=await feeds(),since0=await txt(p,'#sinceVal'),sub0=await txt(p,'#sinceSub');
ok('before: the demo day has feeds and a time since the last one',f0>0&&since0!=='--',`${f0} feeds · ${since0} · ${sub0}`);
// log a row with just a pump amount
await p.click('#logNow');await p.clock.runFor(300);
const rows=await p.$$('#feeds .feed');const last=rows[rows.length-1];
const id=await last.getAttribute('data-id');
await last.$eval('[data-k="pump"]',(e)=>{e.value='135';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))});
await p.clock.runFor(500);await p.waitForTimeout(200);
const row=()=>p.$(`#feeds .feed[data-id="${id}"]`);
const saved=(await S(p)).days[K].feeds.find(f=>f.id===id);
ok('the row saves 135 mL pumped and nothing else',saved&&+saved.pump===135&&saved.bottle==null&&!saved.left&&!saved.right,JSON.stringify(saved));
ok('it is labeled ⚡ "Pumping only, not counted as a feed"',(await (await row()).$eval('.n',e=>[e.textContent.trim(),e.title])).join('|')==='⚡|Pumping only, not counted as a feed',await (await row()).$eval('.n',e=>e.textContent+' '+e.title));
ok('the day\'s feeds stay the same',await feeds()===f0,`${f0} → ${await feeds()}`);
ok('"since last feed" doesn\'t reset to now',await txt(p,'#sinceVal')===since0&&!/^0\s?m/.test(await txt(p,'#sinceVal')),`${since0} → ${await txt(p,'#sinceVal')}`);
ok('the pumped amount still counts in the day\'s Pumped total',/Pumped\s+\d+/i.test(await txt(p,'#stats'))&&+(await txt(p,'#stats')).match(/Pumped\s+(\d+)/i)[1]>=135,(await txt(p,'#stats')).slice(0,200));
// now add a bottle to the same row: it's a feed
await (await row()).$eval('[data-k="bottle"]',(e)=>{e.value='60';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))});
await p.clock.runFor(500);await p.waitForTimeout(200);
ok('adding a bottle makes it a feed: numbered, counted, and the clock resets',/^#\d+$/.test(await (await row()).$eval('.n',e=>e.textContent.trim()))&&await feeds()===f0+1&&await txt(p,'#sinceVal')!==since0,`${await (await row()).$eval('.n',e=>e.textContent.trim())} · ${await feeds()} · ${await txt(p,'#sinceVal')}`);
console.log('errors',errs);await b.close();
