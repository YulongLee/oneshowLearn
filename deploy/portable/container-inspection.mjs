// Docker may report exposed-but-unpublished ports as null bindings.
// Inspect every actual published binding, not image EXPOSE declarations.
export function onlyLoopbackWebBinding(ports,expectedPort) {
 if(!ports||typeof ports!=='object'||Array.isArray(ports))return false;
 const bindings=[];
 for(const [port,values] of Object.entries(ports)) {
  if(values===null)continue;
  if(!Array.isArray(values))return false;
  for(const binding of values) {
   if(!binding||typeof binding!=='object')return false;
   bindings.push({port,binding});
  }
 }
 return bindings.length>0&&bindings.every(({port,binding})=>port==='8080/tcp'&&binding.HostIp==='127.0.0.1'&&binding.HostPort===String(expectedPort));
}
