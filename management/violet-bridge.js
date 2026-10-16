// Fixed server-controlled destination: clients cannot turn the bridge into a proxy.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function createVioletBridge({origin='https://panel-violeta.onrender.com'}={}){
 const base=new URL(origin);if(!['https:','http:'].includes(base.protocol)||base.pathname!=='/'||base.username||base.password)throw new Error('Destino Violeta inválido');
 const site={id:'connected-panel-violeta',name:'Panel Violeta',interface:'violet',external:true,url:base.origin};
 async function call(route,body,cookie){
  let res;try{res=await fetch(base.origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Violeta-Request':'1',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(65000)});}catch{fail(502,'Panel Violeta no responde. Puede estar iniciando; reintentá en un minuto.');}
  let data;try{data=await res.json();}catch{fail(502,'Respuesta inválida de Panel Violeta.');}
  if(!res.ok)fail(res.status===401?428:res.status,data.error||'No se pudo conectar con Panel Violeta.');
  return {data,cookie:res.headers.get('set-cookie')?.split(';')[0]};
 }
 return {site,async connect(session,input){
  if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>100||input.password.length>128)fail(400,'Ingresá usuario y contraseña Master de Violeta.');
  const result=await call('/api/login',{username:input.username,password:input.password,scope:'admin'});
  if(result.data.user?.role!=='master'){if(result.cookie)await call('/api/logout',{},result.cookie);fail(403,'Se necesita una cuenta Master de Violeta.');}
  if(!result.cookie)fail(502,'No se pudo abrir la sesión Violeta.');session.violetCookie=result.cookie;return {connected:true};
 },async request(session,section,method,input){
  if(!session.violetCookie)fail(428,'Conectá la cuenta Master de Panel Violeta para administrar este sitio.');
  const check=await call('/api/session',undefined,session.violetCookie);
  if(check.data.user?.role!=='master'){delete session.violetCookie;fail(428,'La sesión Violeta venció. Volvé a conectar.');}
  if(section==='branding'&&['GET','POST'].includes(method)){
   const result=await call('/api/branding',method==='POST'?input:undefined,session.violetCookie);
   return {...result.data,slots:result.data.slots.map(s=>({...s,defaultUrl:base.origin+'/assets/'+s.image}))};
  }
  if(section==='panel'&&method==='GET')return (await call('/api/panel',undefined,session.violetCookie)).data;
  fail(404,'Esta función de Violeta todavía no está conectada.');
 }};
}
