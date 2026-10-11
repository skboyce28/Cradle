// Test-only stand-in for Supabase's HTTP layer (Auth + a PostgREST subset), backed by a real
// Postgres running Cradle's actual SQL with Supabase-like roles and row-level security.
// Keys below are fake test values, not real Supabase keys.
import http from 'http';
import pg from 'pg';
const KEY='sb_publishable_testkey_1234567890';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://postgres@127.0.0.1:55432/postgres'});
const PORT=+(process.env.STANDIN_PORT||54321);
const passwords={};  // filled in as test accounts sign up
const access={},refresh={};const tok=()=>Math.random().toString(36).slice(2);
async function userByEmail(e){const r=await pool.query('select id,email from auth.users where lower(email)=lower($1)',[e]);return r.rows[0]}
function session(u){const a='a'+tok(),r='r'+tok();access[a]={id:u.id,email:u.email,exp:Date.now()+3600e3};refresh[r]=u;return {access_token:a,refresh_token:r,expires_in:3600,token_type:'bearer',user:{id:u.id,email:u.email}}}
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'});res.end(obj===undefined?'':JSON.stringify(obj))};
async function asUser(u,fn){const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:u.id,email:u.email,role:'authenticated'})]);const r=await fn(c);await c.query('commit');return r}catch(e){await c.query('rollback').catch(()=>{});throw e}finally{c.release()}}
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
    if(u.searchParams.get('grant_type')==='refresh_token'){const x=refresh[j.refresh_token];if(!x)return send(res,400,{error:'invalid_grant'});delete refresh[j.refresh_token];return send(res,200,session(x))}
  }
  const a=access[(req.headers.authorization||'').replace('Bearer ','')];
  if(u.pathname==='/auth/v1/logout')return send(res,204);
  if(!a)return send(res,401,{message:'JWT expired'});
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
