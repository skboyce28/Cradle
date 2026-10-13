// Test-only stand-in for Supabase's HTTP layer (Auth + a PostgREST subset), backed by a real
// Postgres running Cradle's actual SQL with Supabase-like roles and row-level security.
// Keys below are fake test values, not real Supabase keys.
import http from 'http';
import crypto from 'crypto';
import pg from 'pg';
import { newSecret, totpOk } from './totp.mjs';
const KEY='sb_publishable_testkey_1234567890';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://postgres@127.0.0.1:55432/postgres'});
const PORT=+(process.env.STANDIN_PORT||54321);
const passwords={};  // filled in as test accounts sign up
const access={},refresh={},challenges={};const tok=()=>Math.random().toString(36).slice(2);
async function userByEmail(e){const r=await pool.query('select id,email from auth.users where lower(email)=lower($1)',[e]);return r.rows[0]}
// Access tokens look like Supabase's (a JWT whose middle part says who and how: aal1 after a
// password, aal2 after the two-step code), but the signature is fake and only this stand-in checks them.
const b64u=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function session(u,aal='aal1'){const exp=Date.now()+3600e3,a=b64u({alg:'HS256',typ:'JWT'})+'.'+b64u({sub:u.id,email:u.email,aal,role:'authenticated',exp:Math.floor(exp/1000),n:tok()})+'.fake'+tok(),r='r'+tok();access[a]={id:u.id,email:u.email,exp,aal};refresh[r]={u,aal};return {access_token:a,refresh_token:r,expires_in:3600,token_type:'bearer',user:{id:u.id,email:u.email}}}
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'});res.end(obj===undefined?'':JSON.stringify(obj))};
async function asUser(u,fn){const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:u.id,email:u.email,role:'authenticated',aal:u.aal||'aal1'})]);const r=await fn(c);await c.query('commit');return r}catch(e){await c.query('rollback').catch(()=>{});throw e}finally{c.release()}}
http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',async()=>{try{
  if(req.method==='OPTIONS')return send(res,204);
  const SECRET='sb_secret_testkey_0987654321';
  if(req.headers.apikey===SECRET){const u0=new URL(req.url,'http://x');const m0=u0.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);if(!m0)return send(res,404,{});
    const j0=body?JSON.parse(body):{};const ks=Object.keys(j0);const c=await pool.connect();
    try{await c.query('begin');await c.query('set local role service_role');const fn=m0[1];
      const r=fn==='cradle_push_due'?await c.query('select * from public.cradle_push_due() as r'):await c.query(`select public.${fn}(${ks.map((k,i)=>`${k}=>$${i+1}`).join(',')}) as r`,ks.map(k=>j0[k]));
      await c.query('commit');return send(res,200,fn==='cradle_push_due'?r.rows.map(x=>x.r):(r.rows[0]?r.rows[0].r:null))}
    catch(e){await c.query('rollback');return send(res,400,{code:e.code,message:e.message})}finally{c.release()}}
  if(req.headers.apikey!==KEY)return send(res,401,{message:'Invalid API key'});
  const u=new URL(req.url,'http://x');const j=body?JSON.parse(body):{};
  if(u.pathname==='/auth/v1/signup'&&req.method==='POST'){
    const em=String(j.email||'').toLowerCase();
    if(/\.invalid$/.test(em)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return send(res,400,{code:400,error_code:'email_address_invalid',msg:`Email address "${em}" is invalid`});
    if(await userByEmail(em))return send(res,422,{code:422,error_code:'user_already_exists',msg:'User already registered'});
    if(String(j.password||'').length<6)return send(res,422,{code:422,error_code:'weak_password',msg:'Password should be at least 6 characters.'});
    const r=await pool.query('insert into auth.users(email) values ($1) returning id,email',[em]);passwords[em]=j.password;return send(res,200,session(r.rows[0]))}
  if(u.pathname==='/auth/v1/token'){
    if(u.searchParams.get('grant_type')==='password'){const x=await userByEmail(j.email);if(!x||passwords[x.email]!==j.password)return send(res,400,{error:'invalid_grant',error_description:'Invalid login credentials'});return send(res,200,session(x))}
    if(u.searchParams.get('grant_type')==='refresh_token'){const x=refresh[j.refresh_token];if(!x)return send(res,400,{error:'invalid_grant'});delete refresh[j.refresh_token];return send(res,200,session(x.u,x.aal))}
  }
  const a=access[(req.headers.authorization||'').replace('Bearer ','')];
  // no sign-in: like Supabase, run as the anon role (only functions granted to anon work)
  const am=u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if(am&&!req.headers.authorization){const fn=am[1],keys=Object.keys(j);const c=await pool.connect();
    try{await c.query('begin');await c.query('set local role anon');await c.query(`select set_config('request.jwt.claims','{"role":"anon"}',true)`);
      const r=await c.query(`select public.${fn}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) as r`,keys.map(k=>j[k]));await c.query('commit');return send(res,200,r.rows[0].r)}
    catch(e){await c.query('rollback').catch(()=>{});if(e.code==='42883')return send(res,404,{code:'PGRST202',message:`Could not find the function public.${fn}`});return send(res,e.code==='42501'?401:400,{code:e.code,message:e.message})}
    finally{c.release()}}
  if(u.pathname==='/auth/v1/logout')return send(res,204);
  if(!a)return send(res,401,{message:'JWT expired'});
  // two-step sign-in: authenticator apps (TOTP factors), like Supabase's /auth/v1/factors
  const factorsOf=async id=>(await pool.query("select id,friendly_name,factor_type,status,secret,created_at from auth.mfa_factors where user_id=$1 order by created_at",[id])).rows;
  if(u.pathname==='/auth/v1/user'&&req.method==='GET'){const fs=await factorsOf(a.id);return send(res,200,{id:a.id,email:a.email,aal:a.aal,factors:fs.length?fs.map(({secret,...f})=>f):undefined})}
  if(u.pathname==='/auth/v1/factors'&&req.method==='POST'){
    const fs=await factorsOf(a.id);
    if(fs.some(f=>f.status==='verified')&&a.aal!=='aal2')return send(res,403,{code:403,error_code:'insufficient_aal',msg:'AAL2 required to enroll a new factor'});
    if(j.factor_type!=='totp')return send(res,400,{code:400,error_code:'validation_failed',msg:'Invalid factor type'});
    if(j.friendly_name&&fs.some(f=>f.friendly_name===j.friendly_name))return send(res,422,{code:422,error_code:'mfa_factor_name_conflict',msg:`A factor with the friendly name "${j.friendly_name}" for this user already exists`});
    const secret=newSecret(),r=await pool.query("insert into auth.mfa_factors(user_id,friendly_name,factor_type,status,secret) values ($1,$2,'totp','unverified',$3) returning id",[a.id,j.friendly_name||null,secret]);
    const uri=`otpauth://totp/${encodeURIComponent(j.issuer||'localhost')}:${encodeURIComponent(a.email)}?issuer=${encodeURIComponent(j.issuer||'localhost')}&secret=${secret}&algorithm=SHA1&digits=6&period=30`;
    return send(res,200,{id:r.rows[0].id,type:'totp',friendly_name:j.friendly_name||'',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/><rect x="5" y="5" width="2" height="2"/></svg>',secret,uri}})}
  const fm=u.pathname.match(/^\/auth\/v1\/factors\/([0-9a-f-]{36})(\/challenge|\/verify)?$/);
  if(fm){const f=(await factorsOf(a.id)).find(x=>x.id===fm[1]);if(!f)return send(res,404,{code:404,error_code:'mfa_factor_not_found',msg:'Factor not found'});
    if(fm[2]==='/challenge'&&req.method==='POST'){const id=crypto.randomUUID();challenges[id]={factor:f.id,exp:Date.now()+300e3};return send(res,200,{id,type:'totp',expires_at:Math.floor(Date.now()/1000)+300})}
    if(fm[2]==='/verify'&&req.method==='POST'){const c=challenges[j.challenge_id];if(!c||c.factor!==f.id)return send(res,404,{code:404,error_code:'mfa_factor_not_found',msg:'Challenge not found'});
      if(Date.now()>c.exp)return send(res,422,{code:422,error_code:'mfa_challenge_expired',msg:'Challenge has expired'});
      if(!totpOk(f.secret,j.code))return send(res,422,{code:422,error_code:'mfa_verification_failed',msg:'Invalid TOTP code entered'});
      delete challenges[j.challenge_id];await pool.query("update auth.mfa_factors set status='verified',updated_at=now() where id=$1",[f.id]);
      return send(res,200,session({id:a.id,email:a.email},'aal2'))}
    if(!fm[2]&&req.method==='DELETE'){if(f.status==='verified'&&a.aal!=='aal2')return send(res,403,{code:403,error_code:'insufficient_aal',msg:'AAL2 required to unenroll verified factor'});
      await pool.query('delete from auth.mfa_factors where id=$1',[f.id]);return send(res,200,{id:f.id})}
  }
  if(u.pathname==='/auth/v1/user'&&req.method==='PUT'){passwords[a.email]=j.password;return send(res,200,{id:a.id,email:a.email})}
  const m=u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if(m){const fn=m[1],keys=Object.keys(j);
    try{const r=await asUser(a,c=>c.query(`select public.${fn}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) as r`,keys.map(k=>j[k])));return send(res,200,r.rows[0].r)}
    catch(e){if(e.code==='42883')return send(res,404,{code:'PGRST202',message:`Could not find the function public.${fn}`});return send(res,400,{code:e.code,message:e.message})}}
  if(u.pathname==='/rest/v1/cradle_items'){
    if(req.method==='GET'){const cond=[],vals=[];for(const [k,v] of u.searchParams){if(['select','order','limit'].includes(k))continue;const [op,...rest]=v.split('.');const val=rest.join('.');vals.push(val);cond.push(`${k} ${op==='eq'?'=':op==='gte'?'>=':'='} $${vals.length}`)}
      const sql=`select ${u.searchParams.get('select')||'*'} from public.cradle_items ${cond.length?'where '+cond.join(' and '):''} order by updated_at asc limit ${+(u.searchParams.get('limit')||1000)}`;
      const r=await asUser(a,c=>c.query(sql,vals));return send(res,200,r.rows.map(x=>Object.assign(x,{updated_at:x.updated_at&&x.updated_at.toISOString()})))}
    if(req.method==='POST'){const arr=Array.isArray(j)?j:[j];const conflict=u.searchParams.get('on_conflict');
      try{await asUser(a,async c=>{for(const it of arr){const cols=Object.keys(it);await c.query(`insert into public.cradle_items(${cols.join(',')}) values (${cols.map((_,i)=>'$'+(i+1)).join(',')}) on conflict (${conflict}) do update set ${cols.filter(x=>!conflict.split(',').includes(x)).map(x=>`${x}=excluded.${x}`).join(',')}`,cols.map(k=>k==='data'?JSON.stringify(it[k]):it[k]))}});return send(res,201)}
      catch(e){return send(res,e.code==='42501'?403:400,{code:e.code,message:e.message})}}
  }
  send(res,404,{message:'not found'});
}catch(e){send(res,500,{message:String(e.message||e)})}})}).listen(PORT,()=>console.log('supabase stand-in on '+PORT));
