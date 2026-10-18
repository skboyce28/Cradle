// Baby mirror (Learning center): opens the front camera mirrored and full screen, frames and zoom
// (remembered), buttons fade and a tap brings them back, closing needs a press-and-hold, the camera
// turns off on close and in the background, and a clear message when camera access is refused.
import { chromium } from 'playwright';import fs from 'fs';
const DEMO=fs.readFileSync(new URL('./fixtures/demo-bath.json',import.meta.url),'utf8');const OUT=(process.env.CRADLE_OUT||'out')+'/';
const b=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});const errs=[];
const bNo=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chromium'}),args:['--use-fake-device-for-media-stream','--deny-permission-prompts']});
const CL=JSON.stringify({url:'https://demo.supabase.co',key:'sb_publishable_demo_key_000000000000',session:{access:'a',refresh:'r',exp:Date.parse('2027-01-01'),email:'alex@example.com'},owner:'u1',household:'h1',fam:{household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[]},init:true,welcomed:{'alex@example.com':true},synced:{},last:'2026-10-09T18:00:00Z'});
async function phone({w=390,h=844,data=DEMO,br=b}={}){
  const ctx=await br.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,acceptDownloads:true,permissions:['clipboard-read','clipboard-write'],...(w<600?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'}:{})});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:new Date('2026-10-09T14:40:00')});
  await p.route('https://demo.supabase.co/**',r=>{const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:H});if(r.request().url().includes('/rpc/'))return r.fulfill({status:200,headers:H,contentType:'application/json',body:JSON.stringify({household:'h1',name:"Juniper's family",join_code:'K7QM-4XPD',role:'owner',members:[],invites:[],claimed:false})});if(r.request().method()==='GET')return r.fulfill({status:200,headers:H,contentType:'application/json',body:'[]'});return r.fulfill({status:201,headers:H,body:''})});
  await p.goto(process.env.CRADLE_APP);
  await p.evaluate(([d,c])=>{localStorage.clear();if(d){const S=JSON.parse(d);S.achSeen=['latch','week','eight','duty','pro','sun','full','big','pump','switch'];localStorage.setItem('cradle-feeding-v1',JSON.stringify(S))}localStorage.setItem('cradle-cloud-v1',c)},[data,CL]);
  await p.reload();await p.clock.runFor(2500);await p.waitForTimeout(300);await p.evaluate(()=>window.print=()=>{});return p}
const S=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cradle-feeding-v1')));
const txt=async(p,sel)=>(await p.innerText(sel)).replace(/\s+/g,' ').trim();
const ok=(name,cond,extra='')=>console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  | '+extra:''));

const cam=p=>p.evaluate(()=>{const v=document.getElementById('mrVideo'),st=v.srcObject;return {live:!!st&&st.getVideoTracks().some(t=>t.readyState==='live'),w:v.videoWidth,facing:st?st.getVideoTracks()[0].getSettings().facingMode||'':'',transform:getComputedStyle(v).transform}});
const waitCam=async p=>{for(let i=0;i<30;i++){const c=await cam(p);if(c.live&&c.w>0)return c;await p.waitForTimeout(150)}return cam(p)};

let p=await phone();
await p.click('#menuBtn');await p.click('[data-act=learn]');await p.waitForTimeout(200);
ok('the Learning center offers the baby mirror, and says nothing is recorded',await p.isVisible('#lcMirror')&&/Nothing is recorded or saved/.test(await txt(p,'#learnModal')));
await p.click('#lcMirror');let c=await waitCam(p);
ok('it opens full screen with the camera on',await p.isVisible('#mirror')&&!(await p.isVisible('#learnModal'))&&c.live&&c.w>0,JSON.stringify(c));
ok('the picture is mirrored, like a real mirror',/matrix\(-1, 0, 0, 1/.test(c.transform),c.transform);
ok('starts with the star frame',await p.$eval('#mrFrame',e=>e.className)==='stars'&&/Frame: Stars/.test(await txt(p,'#mrFrameBtn')));
await p.screenshot({path:OUT+'mirror.png'});
const center=async()=>{const buf=await p.screenshot({clip:{x:40,y:150,width:4,height:4}});return buf.toString('base64')};const camPix=await center();
await p.click('#mrFrameBtn');ok('Frame switches to Rainbow',await p.$eval('#mrFrame',e=>e.className)==='rainbow'&&/Rainbow/.test(await txt(p,'#mrFrameBtn')));
ok('the rainbow is only a border: the camera still shows in the middle',await p.$eval('#mrFrame',e=>getComputedStyle(e).backgroundImage==='none')&&(await center())===camPix);
await p.screenshot({path:OUT+'mirror-rainbow.png'});
await p.click('#mrFrameBtn');ok('…then None',await p.$eval('#mrFrame',e=>e.className)===''&&/None/.test(await txt(p,'#mrFrameBtn')));
await p.click('#mrFrameBtn');
await p.click('#mrZoomBtn');ok('Zoom in fills the screen more',await p.$eval('#mirror',e=>e.classList.contains('zoom'))&&/Zoom out/.test(await txt(p,'#mrZoomBtn')));
// controls fade, and a tap brings them back
await p.clock.runFor(4500);ok('the buttons fade after a few seconds',await p.$eval('#mirror',e=>e.classList.contains('idle')));
await p.mouse.click(195,420);await p.clock.runFor(100);ok('a tap on the picture brings them back',!(await p.$eval('#mirror',e=>e.classList.contains('idle'))));
// a quick tap doesn't close it; holding does
await p.click('#mrClose');await p.clock.runFor(300);
ok('a quick tap on close doesn\'t close it (a baby\'s tap won\'t)',await p.isVisible('#mirror')&&/Press and hold to close/.test(await txt(p,'#toast')));
const bx=await p.$eval('#mrClose',e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}});
await p.mouse.move(bx.x,bx.y);await p.mouse.down();await p.clock.runFor(400);await p.mouse.up();await p.clock.runFor(600);
ok('letting go early doesn\'t close it either',await p.isVisible('#mirror'));
await p.mouse.down();await p.clock.runFor(900);await p.mouse.up();await p.waitForTimeout(150);
ok('holding for a moment closes it, back to the Learning center',!(await p.isVisible('#mirror'))&&await p.isVisible('#learnModal'));
c=await cam(p);ok('the camera is off after closing',!c.live,JSON.stringify(c));
ok('the frame and zoom are remembered',await p.evaluate(()=>{const m=JSON.parse(localStorage.getItem('cradle-feeding-v1')).ui.mirror;return m.frame==='stars'&&m.zoom===true}));
// background: camera off; back: on again
await p.click('#lcMirror');await waitCam(p);
await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
c=await cam(p);ok('switching away turns the camera off',!c.live);
await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
c=await waitCam(p);ok('coming back turns it on again',c.live&&await p.isVisible('#mirror'));
await p.keyboard.press('Escape');await p.waitForTimeout(150);ok('Escape closes it on a computer',!(await p.isVisible('#mirror'))&&!(await cam(p)).live);
// camera access refused
const q=await phone({br:bNo});
await q.click('#menuBtn');await q.click('[data-act=learn]');await q.click('#lcMirror');await q.waitForTimeout(1200);
ok('camera refused: it explains how to allow it, with Try again',/Cradle needs the camera for the mirror/.test(await txt(q,'#mrMsg'))&&await q.isVisible('#mrMsg [data-mr=retry]'),await txt(q,'#mrMsg'));
await q.screenshot({path:OUT+'mirror-denied.png'});
console.log('errors',errs);await b.close();await bNo.close();
