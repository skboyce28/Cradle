import { chromium } from 'playwright';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'});const errs=[];
const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
async function phone(role){
  const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  const FAM={household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role,members:[{user_id:'u0',email:'alex@example.com',role:'owner',me:role==='owner'},{user_id:'u1',email:'grandma@cradle.cfg',role:'member',me:role!=='owner'}],invites:[],claimed:false};
  let logout=0;await ctx.route('https://demo.supabase.co/**',r=>{const u=r.request().url(),m=r.request().method();if(m==='OPTIONS')return r.fulfill({status:204,headers:H});
    if(u.includes('/auth/v1/token'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({access_token:'a',refresh_token:'r',expires_in:3600,user:{id:role,email:role+'@example.com'}})});
    if(u.includes('/auth/v1/logout')){logout++;return r.fulfill({status:204,headers:H})}
    if(u.includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify(FAM)});
    if(m==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto('http://localhost:8099/');await p.waitForSelector('#gLogin:not(.hidden)');
  await p.fill('#gUser',role+'@example.com');await p.fill('#gPass','longenough1');await p.click('#gGo');await p.waitForTimeout(2500);
  await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')));
  await p.click('#logNow');await p.click('.feed .side');await p.click('#addBath');await p.waitForTimeout(2500);
  return {p,ctx,logouts:()=>logout}}
const rows=p=>p.evaluate(()=>{const S=JSON.parse(localStorage.getItem('cradle-feeding-v1')||'{"days":{}}');return Object.values(S.days).reduce((t,d)=>t+d.feeds.length,0)});
// member: erase blocked
const M=await phone('member');
await M.p.click('#menuBtn');await M.p.click('[data-act=data]');const note=(await M.p.innerText('#ddErase')).replace(/\s+/g,' ');ok('menu marks Erase all data as owner only',/Only the family owner/.test(note)&&await M.p.evaluate(()=>document.getElementById('ddErase').classList.contains('dim')),note);
await M.p.click('[data-dm=erase]');await M.p.waitForTimeout(300);const mm=await M.p.innerText('#askMsg');
ok('member is told only the owner can erase',/Only the family owner \(alex\) can erase the whole log/.test(mm),mm);await M.p.click('#askOk');
ok('member’s log untouched',await rows(M.p)===2);
// owner: erase allowed
const O=await phone('owner');await O.p.click('#menuBtn');await O.p.click('[data-act=data]');ok('owner sees no restriction',!(await O.p.innerText('#ddErase')).includes('Only the family owner'));
await O.p.click('[data-dm=erase]');await O.p.waitForTimeout(300);ok('owner gets the family-wide warning',/for your whole family\? Every family member/.test(await O.p.innerText('#askMsg')));await O.p.click('#askOk');await O.p.waitForTimeout(500);
ok('owner erase clears the log',await rows(O.p)===0);
// sign out and remove: synced phone
await M.p.click('#menuBtn');await M.p.click('[data-act=data]');ok('Data management has Sign out and remove from this phone',/Sign out and remove from this phone/.test(await M.p.innerText('#dataModal')));await M.p.keyboard.press('Escape');
await M.p.click('#menuBtn');await M.p.click('[data-act=data]');await M.p.click('[data-dm=wipe]');await M.p.waitForTimeout(800);ok('confirms what will be removed',/Sign out and remove your log, settings, and game scores from this phone\?/.test(await M.p.innerText('#askMsg')));
await M.p.click('#askOk');await M.p.waitForLoadState();await M.p.waitForTimeout(2000);
const left=await M.p.evaluate(()=>({feed:localStorage.getItem('cradle-feeding-v1'),cloud:JSON.parse(localStorage.getItem('cradle-cloud-v1')||'{}'),game:localStorage.getItem('cradle-game-v1')}));
ok('back at sign-in',await M.p.isVisible('#gLogin:not(.hidden)'));
ok('log removed from the phone',await rows(M.p)===0);ok('session removed',!left.cloud.session&&!left.cloud.household);ok('game data removed',!left.game);ok('told the server to sign out',M.logouts()>=1);
ok('sign-in screen shows no leftover log',!(await M.p.isVisible('#gHas:not(.hidden)')));
// unsynced changes: offline phone warns
const U=await phone('member');await U.ctx.setOffline(true);await U.p.click('#logNow');await U.p.click('.feed .side >> nth=0');await U.p.waitForTimeout(300);
await U.p.click('#menuBtn');await U.p.click('[data-act=data]');await U.p.click('[data-dm=wipe]');await U.p.waitForTimeout(500);const um=await U.p.innerText('#askMsg');
ok('warns about changes that haven’t synced',/haven.t reached your account yet/.test(um)&&/Remove anyway/.test(await U.p.innerText('#askOk')),um);
await U.p.click('#askCancel');ok('cancel keeps everything',await rows(U.p)===3&&await U.p.evaluate(()=>!!JSON.parse(localStorage.getItem('cradle-cloud-v1')).session));
console.log('errors',errs);await b.close();
