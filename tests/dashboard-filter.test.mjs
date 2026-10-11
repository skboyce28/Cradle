import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const FAM={household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[{user_id:'u1',email:'alex@example.com',role:'owner',me:true},{user_id:'u2',email:'sam@example.com',role:'member',me:false},{user_id:'u3',email:'grandma',role:'member',me:false}],invites:[]};
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:FAM,init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone({theme='light',signedIn=true,demo=true,w=390,h=844}={}){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,colorScheme:theme==='dark'?'dark':'light',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const u=r.request().url();const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});
    if(u.includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify(Object.assign({claimed:false},FAM))});
    if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});
    return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(globalThis.PAGE||process.env.CRADLE_APP);
  await p.evaluate(([d,c,theme,si])=>{localStorage.clear();if(!d)return;const S=JSON.parse(d);S.settings.theme=theme;localStorage.setItem('cradle-feeding-v1',JSON.stringify(S));if(si)localStorage.setItem('cradle-cloud-v1',c)},[demo?DEMO:'',CL,theme,signedIn]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(400);
  return p}
const snap=async(p,n)=>{await p.waitForTimeout(350);await p.screenshot({path:(process.env.CRADLE_OUT||'out')+'/df-'+n+'.png'})};
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const vis=p=>p.$$eval('#tab-dash .card',cs=>cs.filter(c=>c.offsetParent!==null).map(c=>(c.querySelector('h3')||{}).textContent.trim()));
let p=await phone({theme:'light'});
await p.click('#tabs [data-tab=dash]');await p.waitForTimeout(400);
const chips=await p.$$eval('#dashFilter button',bs=>bs.map(b=>b.textContent.trim()));
ok('chips across the top',chips.join('|')==='All|🤱 Feeds|🍼 Bottle & pump|💧 Diapers|☀️ Vitamin D|⚖️ Weight|🛁 Baths',chips.join('|'));
ok('All is selected and shows everything',await p.isVisible('#dashFilter [data-f=all].on')&&(await vis(p)).length>=17,String((await vis(p)).length));
await snap(p,'all');
const want={feeds:['Feeds per day','Between feeds','Side starts','Insights','by feed','Longest stretch between feeds','Breast side balance','Feeding rhythm'],
 bottle:['Bottle per day','Pumped per day','Insights','by feed','Daily volume'],diapers:['Wet goal met','Stool goal met','Insights','Daily diapers'],
 vitd:['Vitamin D','Insights','Vitamin D','Feeding rhythm'],weight:['Weight'],baths:['Baths','Insights']};
for(const [f,w] of Object.entries(want)){
  await p.click(`#dashFilter [data-f=${f}]`);await p.waitForTimeout(150);const v=await vis(p);
  const okk=v.length===w.length&&w.every(t=>v.some(x=>x.includes(t)));ok(f+' shows just its cards',okk,v.join(' / '));
  if(f!=='weight'){const lis=await p.$$eval('#insights li',ls=>ls.filter(l=>l.offsetParent!==null).map(l=>l.dataset.cat));ok(f+' insights are all relevant',lis.length>0&&lis.every(c=>c.split(' ').includes(f)),lis.join(','))}
  if(['weight','vitd','diapers'].includes(f))await snap(p,f);
}
await p.click('#tabs [data-tab=today]');await p.click('#tabs [data-tab=dash]');await p.waitForTimeout(300);
ok('remembers the filter',await p.isVisible('#dashFilter [data-f=baths].on')&&(await vis(p)).length===2);
await p.click('#rangeSeg [data-n="14"]');await p.waitForTimeout(300);ok('filter survives a range change',(await vis(p)).length===2);
await p.click('#dashFilter [data-f=all]');await p.waitForTimeout(150);ok('All brings everything back',(await vis(p)).length>=17);
const sw=await p.evaluate(()=>document.documentElement.scrollWidth);ok('no sideways page scroll',sw<=390,String(sw));
const d=await phone({theme:'light',w:1280,h:800});await d.click('#tabs [data-tab=dash]');await d.waitForTimeout(300);await d.click('#dashFilter [data-f=bottle]');await snap(d,'desktop');
console.log('errors',errs);await b.close();
