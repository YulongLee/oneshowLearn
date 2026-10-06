import {Router} from 'express';
import {optionalAuth} from './auth.mjs';
import {row,rows} from './db.mjs';
import {rateLimit} from './account-security.mjs';
import {canReadPack} from './opc-routes.mjs';
import {plainNote} from './course-ai-service.mjs';

export function workspaceSearchRouter(){
  const router=Router();
  router.get('/search',optionalAuth,(req,res)=>{
    res.set('Cache-Control','private, no-store');
    const q=String(req.query.q||'').trim().toLowerCase().slice(0,120);
    if(!q)return res.json({items:[]});
    rateLimit('workspace-search',req.user?String(req.user.id):req.ip,60,60);
    const items=[],matches=value=>String(value||'').toLowerCase().includes(q);
    const packs=rows(`SELECT p.id,p.slug,p.title,p.subtitle,p.description FROM project_packs p JOIN learning_paths l ON l.id=p.path_id AND l.status='published' WHERE p.status='published' AND instr(lower(p.title||' '||p.subtitle||' '||p.description),?)>0 ORDER BY p.sort_order,p.id LIMIT 12`,[q]);
    for(const p of packs)items.push({title:p.title,kind:'课程',path:canReadPack(req.user,p.id)?`/learn/${encodeURIComponent(p.slug)}`:`/course-offer?course=${encodeURIComponent(p.slug)}`});
    for(const p of rows("SELECT id,slug,title FROM practice_projects WHERE status='published' AND instr(lower(title||' '||description||' '||tags),?)>0 ORDER BY sort_order,id LIMIT 12",[q]))items.push({title:p.title,kind:'实战项目',path:`/projects/${encodeURIComponent(p.slug)}`});
    for(const r of rows(`SELECT ci.id,ci.title FROM published_content_items ci JOIN project_steps s ON s.id=ci.step_id AND s.status='published' JOIN project_packs p ON p.id=s.pack_id AND p.status='published' JOIN learning_paths l ON l.id=p.path_id AND l.status='published' WHERE ci.status='published' AND instr(lower(ci.title||' '||s.summary),?)>0 ORDER BY ci.id DESC LIMIT 12`,[q]))items.push({title:r.title,kind:'课程资料',path:`/resources?resource=${r.id}`});
    if(req.user){
      const state=JSON.parse(row('SELECT state_json FROM workspace_state WHERE user_id=?',[req.user.id])?.state_json||'{}');
      for(const n of (state.notes||[]).filter(n=>!n.deletedAt&&matches(n.title+' '+plainNote(n.body)+' '+(n.tags||[]).join(' '))).slice(0,12))items.push({title:n.title,kind:'个人笔记 · 仅自己可见',path:`/notes?note=${encodeURIComponent(n.id)}`});
      for(const n of rows("SELECT id,title FROM learning_notes WHERE user_id=? AND deleted_at IS NULL AND instr(lower(title||' '||body),?)>0 ORDER BY updated_at DESC,id LIMIT 12",[req.user.id,q]))items.push({title:n.title,kind:'课时笔记 · 仅自己可见',path:`/notes?learningNote=${encodeURIComponent(n.id)}`});
    }
    // Return destinations and labels only. Never send bodies or download tickets.
    res.json({items});
  });
  return router;
}
