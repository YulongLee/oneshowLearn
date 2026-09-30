const nodes=new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','blockquote','codeBlock','hardBreak','horizontalRule','image']);
const marks=new Set(['bold','italic','underline','strike','code','link']);
// Store structured rich text, not executable HTML; images are private inline
// snapshots with bounded size, never remote tracking URLs or SVG payloads.
export function validNoteBody(body){
  let doc;try{doc=JSON.parse(body);}catch{return true;}
  if(doc?.type!=='doc')return true;
  let count=0;
  const visit=(node,depth=0)=>{
    if(++count>5000||depth>30||!node||!nodes.has(node.type))return false;
    if(node.text!==undefined&&typeof node.text!=='string')return false;
    if(node.type==='image'&&!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(node.attrs?.src||''))return false;
    if(node.marks&&(!Array.isArray(node.marks)||!node.marks.every(m=>marks.has(m.type)&&(m.type!=='link'||/^https?:\/\//i.test(m.attrs?.href||'')))))return false;
    return !node.content||(Array.isArray(node.content)&&node.content.every(child=>visit(child,depth+1)));
  };
  return visit(doc);
}
