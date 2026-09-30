import { Router } from 'express';
import { optionalAuth } from './auth.mjs';
import { row, rows } from './db.mjs';
import { canReadPack, publishedContent } from './opc-routes.mjs';
import { safeResourceUrl } from './opc-definition.mjs';
import {materialUrl} from './materials.mjs';

// Project discovery exposes published metadata, never paid bodies or draft lessons.
export function projectRouter() {
  const router = Router();
  router.get('/projects/:slug', optionalAuth, (req, res) => {
    const pack = row(`SELECT pp.id,pp.slug,pp.title,pp.subtitle,pp.description,pp.deliverable,pp.cover_url,pp.estimated_minutes,lp.title path_title
      FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
      WHERE pp.slug=? AND pp.status='published'`, [req.params.slug]);
    if (!pack) return res.status(404).json({ error:'项目不存在或暂未发布' });
    const entitled = canReadPack(req.user, pack.id);
    const chapters = rows("SELECT id,title,summary FROM project_steps WHERE pack_id=? AND status='published' ORDER BY sort_order,id", [pack.id]).map(chapter => ({
      ...chapter,
      items:rows(`SELECT ci.id,ci.title,ci.type,ci.is_preview,ci.duration_seconds,pr.status progress
        FROM published_content_items ci LEFT JOIN progress pr ON pr.content_item_id=ci.id AND pr.user_id=?
        WHERE ci.step_id=? AND ci.status='published' ORDER BY ci.sort_order,ci.id`, [req.user?.id || 0, chapter.id]).map(item => {
          const locked = !entitled && !item.is_preview;
          return { ...item, locked, progress:locked ? null : item.progress };
        }),
    }));
    res.set('Cache-Control','private, no-store').json({ ...pack, entitled, chapters });
  });
  router.get('/projects/:slug/content/:id', optionalAuth, (req, res) => {
    const item = publishedContent(Number(req.params.id));
    if (!item || item.pack_slug !== req.params.slug) return res.status(404).json({error:'内容不存在或暂未发布'});
    if (!item.is_preview && !canReadPack(req.user, item.pack_id)) return res.status(403).json({error:'当前账号没有此项目的学习权限'});
    res.set('Cache-Control','private, no-store').json({item:{id:item.id,title:item.title,type:item.type,body:item.body,resource_url:materialUrl(safeResourceUrl(item.resource_url),req.user),duration_seconds:item.duration_seconds}});
  });
  return router;
}
