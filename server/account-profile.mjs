import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db, row, run } from './db.mjs';
import { requireAuth } from './auth.mjs';
import { AccountError } from './account-security.mjs';

// Private account data; never placed in the public attachment directory.
export function profileFor(userId) {
  const user = row('SELECT name,email,email_verified,created_at,password_hash FROM users WHERE id=?', [userId]);
  const data = row('SELECT bio,avatar,revision FROM account_profiles WHERE user_id=?', [userId]);
  const version = createHash('sha256').update(JSON.stringify([user.name, data?.revision || 0])).digest('hex');
  return { hasPassword:Boolean(user.password_hash), name:user.name, email:user.email, emailVerified:Boolean(user.email_verified), createdAt:user.created_at,
    bio:data?.bio || '', avatar:data?.avatar || '', version };
}
function validAvatar(value) {
  if (!value) return true;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 200 * 1024 || bytes.length < 12 || bytes.toString('base64') !== match[2]) return false;
  return match[1] === 'png' ? bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a'
    : match[1] === 'jpeg' ? bytes.subarray(0,3).toString('hex') === 'ffd8ff' && bytes.subarray(-2).toString('hex') === 'ffd9'
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
}
const schema = z.object({ name:z.string().trim().min(2).max(80), bio:z.string().trim().max(300),
  avatar:z.string().max(280000).refine(validAvatar) }).strict();
export function installAccountProfile(router) {
  db.exec(`CREATE TABLE IF NOT EXISTS account_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0
  )`);
  router.get('/profile', requireAuth, (req,res) => res.set('Cache-Control','no-store').json(profileFor(req.user.id)));
  router.put('/profile', requireAuth, (req,res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new AccountError(400,'请检查昵称（2–80 字）、简介（最多 300 字）和头像格式');
    const expected = req.get('If-Match');
    if (!expected) throw new AccountError(428,'请先加载最新资料再保存');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (profileFor(req.user.id).version !== expected) throw new AccountError(409,'资料已在其他窗口更新；你的修改已保留，请重新载入后核对');
      const { name, bio, avatar } = parsed.data;
      run('UPDATE users SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[name,req.user.id]);
      run(`INSERT INTO account_profiles(user_id,bio,avatar,revision) VALUES(?,?,?,1)
        ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,avatar=excluded.avatar,revision=account_profiles.revision+1`,[req.user.id,bio,avatar]);
      const saved = profileFor(req.user.id);
      db.exec('COMMIT');
      return res.set('Cache-Control','no-store').json(saved);
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  });
}
