const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
let handler=null;
for(const [label,env] of [['new secret keys',{SUPABASE_URL:'http://localhost:54321',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_testkey_0987654321'})}],['missing key',{SUPABASE_URL:'http://localhost:54321'}]]){
  globalThis.Deno={env:{get:k=>env[k]},serve:h=>{handler=h}};
  await import('../../supabase/functions/cradle-notify/index.ts?'+label.replace(/ /g,''));
  const res=await handler(new Request('http://x/'));const j=await res.json();
  if(label==='missing key')ok('without a key it says so instead of crashing',res.status===500&&/missing/.test(j.error),JSON.stringify(j));
  else ok('Supabase entry point runs a round with the project’s secret key',res.status===200&&j.keys_ready===true&&typeof j.sent==='number',JSON.stringify(j));
}
