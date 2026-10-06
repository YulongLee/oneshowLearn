export function listPage(query,{size=20,max=100}={}){
 const number=(value,fallback)=>typeof value==='string'&&/^\d{1,7}$/.test(value)?Number(value):fallback;
 return {offset:Math.min(1000000,number(query.offset,0)),limit:Math.min(max,Math.max(1,number(query.limit,size))),q:String(query.q||'').trim().slice(0,120)};
}
