import pg from 'pg';import http from 'http';import { run } from '../../supabase/functions/cradle-notify/index.ts';
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const q=(s,v)=>pool.query(s,v).then(r=>r.rows);
const unb=(s)=>Uint8Array.from(Buffer.from(s,'base64url'));const b64u=b=>Buffer.from(b).toString('base64url');
const cat=(...p)=>Buffer.concat(p.map(x=>Buffer.from(x)));
async function hkdf(salt,ikm,info,len){const k=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},k,len*8))}
// a fake phone: its own push keys, and a decrypt that mirrors what a browser does
async function phone(){const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);const pub=new Uint8Array(await crypto.subtle.exportKey('raw',kp.publicKey));const auth=crypto.getRandomValues(new Uint8Array(16));
  return {kp,p256dh:b64u(pub),auth:b64u(auth),async decrypt(body){const b=new Uint8Array(body);const salt=b.slice(0,16),idlen=b[20],as=b.slice(21,21+idlen),ct=b.slice(21+idlen);
    const asKey=await crypto.subtle.importKey('raw',as,{name:'ECDH',namedCurve:'P-256'},false,[]);const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:asKey},kp.privateKey,256));
    const ikm=await hkdf(auth,shared,cat(new TextEncoder().encode('WebPush: info\0'),pub,as),32);const cek=await hkdf(salt,ikm,new TextEncoder().encode('Content-Encoding: aes128gcm\0'),16);const nonce=await hkdf(salt,ikm,new TextEncoder().encode('Content-Encoding: nonce\0'),12);
    const k=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']);const pt=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},k,ct));return JSON.parse(new TextDecoder().decode(pt.slice(0,pt.lastIndexOf(2))))}}}
// fake push service
const got=[];let statusFor={};
const srv=http.createServer((req,res)=>{const ch=[];req.on('data',c=>ch.push(c));req.on('end',()=>{got.push({path:req.url,headers:req.headers,body:Buffer.concat(ch)});const s=statusFor[req.url]||201;res.writeHead(s);res.end()})}).listen(8765);
const rpc=async(fn,args)=>{const c=await pool.connect();try{await c.query('begin');await c.query('set local role service_role');const keys=Object.keys(args);const r=await c.query(`select public.${fn}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) as r`,keys.map(k=>args[k]));await c.query('commit');
  if(fn==='cradle_push_due')return r.rows.map(x=>x.r);return r.rows[0]&&r.rows[0].r}finally{c.release()}};
const rpcDue=async()=>{const c=await pool.connect();try{await c.query('begin');await c.query('set local role service_role');const r=await c.query('select * from public.cradle_push_due() as r');await c.query('commit');return r.rows.map(x=>x.r)}finally{c.release()}};
const rpc2=(fn,args)=>fn==='cradle_push_due'?rpcDue():rpc(fn,args);
// setup: a family with one feed 2h50m ago (feed interval 3h), in New York time
const TZ='America/New_York';
await q("delete from cradle_push_keys");
const [u]=await q("insert into auth.users(email) values ('push'||floor(random()*1e9)||'@t.co') returning id");
const [h]=await q("insert into cradle_households(name) values ('Push test') returning id");
await q("insert into cradle_members(household_id,user_id,email,role) values ($1,$2,'p','owner')",[h.id,u.id]);
const local=(mins)=>q(`select to_char((now() at time zone $1) - make_interval(mins=>$2),'YYYY-MM-DD') d, to_char((now() at time zone $1) - make_interval(mins=>$2),'HH24:MI') t`,[TZ,mins]).then(r=>r[0]);
const add=async(id,mins,extra)=>{const {d,t}=await local(mins);await q("insert into cradle_items(owner,household_id,id,kind,data) values ($1,$2,$3,'feed',$4)",[u.id,h.id,'feed:'+id,{day:d,time:t,...extra}])};
await q("insert into cradle_items(owner,household_id,id,kind,data) values ($1,$2,'settings','settings',$3)",[u.id,h.id,{feedInterval:3,babyName:'Juniper'}]);
await add('a',170,{left:true,right:false,mins:15,bottle:40});
await add('b',60,{bath:'tub',note:''});                              // a bath: never a feed
await add('c',30,{left:false,right:false,urine:true,stool:false});    // diaper only: never a feed
const A=await phone(),B=await phone();
await q("insert into cradle_push_subs(endpoint,user_id,household_id,p256dh,auth,tz,lead_min) values ('http://localhost:8765/A',$1,$2,$3,$4,$5,15),('http://localhost:8765/B',$1,$2,$6,$7,$5,0)",[u.id,h.id,A.p256dh,A.auth,TZ,B.p256dh,B.auth]);
// round 1
let r=await run({rpc:rpc2});
ok('first run creates the notification keys',r.keys_ready&&(await q('select count(*)::int n from cradle_push_keys'))[0].n===1);
ok('phone set to 15 min before is told; the other is not yet',r.sent===1&&got.length===1&&got[0].path==='/A',JSON.stringify(r)+' '+got.map(g=>g.path));
const msg=await A.decrypt(got[0].body);
ok('the phone can decrypt it',/^🍼 Feed due in (9|10|11) min · Juniper$/.test(msg.title),msg.title);
ok('it says when, in local time',/^Due at \d{1,2}:\d{2}[ap]m\. Last feed was at \d{1,2}:\d{2}[ap]m\.$/.test(msg.body),msg.body);
const expLast=(await q(`select lower(to_char((now() at time zone $1) - interval '170 minutes','FMHH12:MIam')) t`,[TZ]))[0].t;ok('bath and diaper-only rows are not feeds (last feed is the real one)',msg.body.includes('Last feed was at '+expLast+'.'),expLast);
const hd=got[0].headers;ok('Web Push headers',hd['content-encoding']==='aes128gcm'&&/^vapid t=.+, k=.+$/.test(hd.authorization)&&hd.ttl==='3600'&&hd.urgency==='high',hd.authorization.slice(0,20));
// round 2: nothing new
r=await run({rpc:rpc2});ok('no repeat for the same feed',r.sent===0&&got.length===1);
// a newer feed moves the due time; nothing due now
await add('d',5,{bottle:30});r=await run({rpc:rpc2});ok('a new feed resets the clock',r.sent===0&&got.length===1);
// overdue feed: phone B (due now) gets told, A gets the "due now" too since due passed
await q("delete from cradle_items where id in ('feed:d','feed:a')");await add('e',185,{right:true});
r=await run({rpc:rpc2});const paths=got.slice(1).map(g=>g.path).sort().join(',');
ok('when the feed is due, both phones are told',r.sent===2&&paths==='/A,/B',paths);
ok('"due now" wording',(await B.decrypt(got.find((g,i)=>i>0&&g.path==='/B').body)).title==='🍼 Feed due now · Juniper');
// stale: more than 2 hours overdue sends nothing
await q("delete from cradle_items where id='feed:e'");await add('f',60*5+30,{left:true});await q("update cradle_push_subs set last_sent_due=null");
r=await run({rpc:rpc2});ok('nothing for a feed more than 2 hours overdue',r.sent===0,JSON.stringify(r));
// a phone that unsubscribed (410) is removed; other failures are counted
await q("delete from cradle_items where id='feed:f'");await add('g',181,{left:true});statusFor['/A']=410;statusFor['/B']=500;
r=await run({rpc:rpc2});const subs=await q("select endpoint,fails from cradle_push_subs where household_id=$1",[h.id]);
ok('410 removes the subscription; 500 is counted',subs.length===1&&subs[0].endpoint.endsWith('/B')&&subs[0].fails===1,JSON.stringify(subs));
// keys stay the same across runs
const k1=(await q('select public_key from cradle_push_keys'))[0].public_key;await run({rpc:rpc2});ok('keys are kept, so phones stay subscribed',(await q('select public_key from cradle_push_keys'))[0].public_key===k1);
// permissions
const deny=async(role,fn)=>{const c=await pool.connect();try{await c.query('begin');await c.query('set local role '+role);await c.query(`select public.${fn}()`);return false}catch(e){return /permission denied/.test(e.message)}finally{await c.query('rollback');c.release()}};
ok('the app cannot read the private key or run the sender',await deny('authenticated','cradle_push_get_keys')&&await deny('authenticated','cradle_push_due')&&await deny('anon','cradle_push_due'));
const rls=async(role)=>{const c=await pool.connect();try{await c.query('begin');await c.query('set local role '+role);const r=await c.query('select count(*)::int n from cradle_push_keys');return r.rows[0].n}catch(e){return 'denied'}finally{await c.query('rollback');c.release()}};
ok('push tables are closed to the app',[await rls('authenticated'),await rls('anon')].every(x=>x===0||x==='denied'));
await q("delete from cradle_households where id=$1",[h.id]);srv.close();await pool.end();
