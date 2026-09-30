import { Router } from 'express';
import { optionalAuth } from './auth.mjs';
import { rows } from './db.mjs';
import { canReadPack } from './opc-routes.mjs';

export function resourceRouter() {
  const router = Router();
  // Public discovery contains only published metadata. Content and attachment URLs
  // remain behind the existing project reader's preview/entitlement checks.
  router.get('/resources', optionalAuth, (req,res) => {
    const access = new Map();
    const items = rows(`SELECT ci.id,ci.title,ci.type,ci.is_preview,ci.created_at,ci.updated_at,
      ps.title step_title,ps.summary,pp.id pack_id,pp.slug pack_slug,pp.title pack_title,pp.is_featured,pr.status progress
      FROM published_content_items ci JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published'
      JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published'
      JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
      LEFT JOIN progress pr ON pr.content_item_id=ci.id AND pr.user_id=?
      WHERE ci.status='published' ORDER BY ci.created_at DESC,ci.id DESC`,[req.user?.id||0]).map(item=>{
      if(!access.has(item.pack_id)) access.set(item.pack_id,canReadPack(req.user,item.pack_id));
      const locked=!item.is_preview&&!access.get(item.pack_id);
      return {...item,locked,progress:locked?null:item.progress};
    });
    res.set('Cache-Control','private, no-store').json({items});
  });
  return router;
}
