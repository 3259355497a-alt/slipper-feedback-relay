// A bounded submission relay. Never forward admin requests, credentials, or arbitrary URLs.
const upstream='https://slipper-dream-feedback.cozywood15.chatgpt.site';
const androidOrigin='https://appassets.androidplatform.net';
const origins=new Set([androidOrigin,'null','https://slipper-dream-ten-trials.cozywood15.chatgpt.site']);
const operations=new Set(['ticket','feedback','version']);
function answer(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});}
export function createRelay(operation,requestFetch=fetch){
  if(!operations.has(operation))throw new Error('Unsupported operation');
  return async function handle(request){
    const origin=request.headers.get('origin');
    if(operation==='version'){
      if(request.method!=='GET')return answer({ok:false,error:'method'},405);
    }else{
      if(!origins.has(origin))return answer({ok:false,error:'origin'},403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
      if(request.method!=='POST')return answer({ok:false,error:'method'},405,origin);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return answer({ok:false,error:'content-type'},415,origin);
    }
    let payload;
    if(operation!=='version'){
      if(Number(request.headers.get('content-length'))>14000)return answer({ok:false,error:'size'},413,origin);
      try{
        const raw=await request.text();
        if(new TextEncoder().encode(raw).byteLength>14000)return answer({ok:false,error:'size'},413,origin);
        const data=JSON.parse(raw);
        if(!data||Array.isArray(data)||typeof data!=='object')throw Error();
        const fields=operation==='ticket'?['playerId','installationId']:['playerId','installationId','requestId','ticket','nickname','category','message','version'];
        payload=Object.fromEntries(fields.filter(k=>typeof data[k]==='string').map(k=>[k,data[k]]));
      }catch{return answer({ok:false,error:'invalid'},400,origin);}
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await requestFetch(upstream+'/api/'+operation,{method:operation==='version'?'GET':'POST',headers:operation==='version'?{}:{'Content-Type':'application/json','Origin':androidOrigin},body:payload?JSON.stringify(payload):undefined,redirect:'error',credentials:'omit',signal:controller.signal});
      const raw=await response.text();
      if(raw.length>24000)throw Error('Invalid response');
      const data=JSON.parse(raw);
      if(!response.ok)return answer({ok:false,error:typeof data.error==='string'?data.error:'unavailable'},response.status,origin);
      if(operation==='feedback'&&(!data.ok||data.id!==payload.requestId))throw Error('Missing storage receipt');
      if(operation==='ticket'&&(!data.ok||typeof data.ticket!=='string'))throw Error('Missing ticket');
      return answer(data,response.status,operation==='version'?'*':origin);
    }catch{return answer({ok:false,error:'unavailable'},503,origin);}
    finally{clearTimeout(timer);}
  };
}

export default {fetch(request){const u=new URL(request.url),match=/^\/api\/(ticket|feedback|version)$/.exec(u.pathname),op=match?.[1]||(u.pathname==='/api/index'?u.searchParams.get('operation'):null);if(!operations.has(op))return answer({ok:false,error:'not-found'},404);return createRelay(op)(request);}};
