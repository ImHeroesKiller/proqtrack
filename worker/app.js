import baseWorker,{verifyToken} from './index.js';
import {handleIdentityRead} from './identity-read.js';

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}});
const bearer=request=>{const value=request.headers.get('authorization')||'';return value.startsWith('Bearer ')?value.slice(7).trim():'';};
const requestId=request=>request.headers.get('cf-ray')||crypto.randomUUID();
const isIdentityPath=pathname=>pathname.startsWith('/api/identity/')||pathname.startsWith('/api/organization/')||pathname.startsWith('/api/access/');

async function authenticate(request,env){
  if(env.API_AUTH_REQUIRED!=='true')return{sub:'development',role:'super_admin',projectIds:[],clientIds:[]};
  return verifyToken(bearer(request),env.API_AUTH_SECRET);
}

const authError=(error,id)=>{
  const code=String(error?.message||error);
  const status=code==='AUTH_REQUIRED'||code.startsWith('TOKEN_')||code==='INVALID_TOKEN'?401:403;
  return json({error:code,requestId:id},status,{'www-authenticate':'Bearer'});
};

async function audit(env,{requestId,actor,action,resourceType,resourceId='',outcome='success',detail=''}){
  try{
    await env.DB.prepare(`INSERT INTO security_audit_logs (request_id,actor_id,actor_role,action,resource_type,resource_id,outcome,detail,created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(requestId,actor?.sub||null,actor?.role||null,action,resourceType,resourceId||null,outcome,String(detail||'').slice(0,1000)).run();
  }catch(error){
    console.warn('identity_audit_write_failed',error?.message||error);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(!isIdentityPath(url.pathname))return baseWorker.fetch(request,env,ctx);
    const id=requestId(request);
    try{
      let claims;
      try{claims=await authenticate(request,env);}catch(error){await audit(env,{requestId:id,action:'authenticate',resourceType:'identity_api',outcome:'denied',detail:error?.message});return authError(error,id);}
      if(env.MVP_DATA_API_ENABLED!=='true')return json({error:'DATA_API_LOCKED',message:'Identity data API remains locked until explicitly enabled.',requestId:id},503);
      return await handleIdentityRead({request,env,url,claims,requestId:id,json,audit});
    }catch(error){
      console.error('identity_request_failed',{requestId:id,path:url.pathname,error:error?.stack||error});
      return json({error:'INTERNAL_ERROR',requestId:id},500);
    }
  },
  scheduled(event,env,ctx){return baseWorker.scheduled?.(event,env,ctx);}
};
