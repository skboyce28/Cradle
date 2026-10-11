import { encryptPush, vapidHeader, newVapidKeys } from '../../supabase/functions/cradle-notify/index.ts';
const ok=(n,c,x='')=>console.log((c?'PASS':'FAIL')+'  '+n+(x?'  | '+x:''));
const unb=(s)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const b64u=(buf)=>Buffer.from(buf).toString('base64url');
// RFC 8291 Appendix A
const asPriv='yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',asPub='BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const uaPub='BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',salt='DGv6ra1nlYgDCS1FRnbzlw',auth='BTBZMqHH6r4Tts7J_aSIgg';
const expect='DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
const p=unb(asPub);const jwk={kty:'EC',crv:'P-256',x:b64u(p.slice(1,33)),y:b64u(p.slice(33)),d:asPriv};
const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const publicKey=await crypto.subtle.importKey('raw',p,{name:'ECDH',namedCurve:'P-256'},true,[]);
const out=await encryptPush('When I grow up, I want to be a watermelon',uaPub,auth,{salt:unb(salt),localKeys:{privateKey,publicKey}});
ok('matches the RFC 8291 example byte for byte',b64u(out)===expect,b64u(out).slice(0,40)+'…');
// VAPID JWT verifies with the public key
const keys=await newVapidKeys();
const h=await vapidHeader('https://fcm.googleapis.com/fcm/send/abc',keys,'https://example.com',Date.parse('2026-10-10T12:00:00Z'));
const m=h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
const pub=await crypto.subtle.importKey('raw',unb(m[4]),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
const good=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,unb(m[3]),new TextEncoder().encode(m[1]+'.'+m[2]));
const claims=JSON.parse(Buffer.from(m[2],'base64url'));
ok('VAPID signature verifies',good);
ok('VAPID claims: push service origin, 12h expiry, contact',claims.aud==='https://fcm.googleapis.com'&&claims.exp===Date.parse('2026-10-10T12:00:00Z')/1000+43200&&claims.sub==='https://example.com',JSON.stringify(claims));
ok('public key is a 65-byte P-256 point',unb(keys.public_key).length===65&&unb(keys.public_key)[0]===4);
