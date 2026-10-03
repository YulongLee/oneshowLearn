import { chmodSync } from 'node:fs';

// Email is genuinely optional for verified phone/WeChat accounts. Never invent
// an email address or mark an external identity as an email verification.
export function migrateLogin(db, databasePath) {
  if (db.prepare('PRAGMA table_info(users)').all().find(c => c.name === 'email')?.notnull) {
    const backup = `${databasePath}.before-login-${Date.now()}.bak`;
    db.prepare('VACUUM INTO ?').run(backup);
    chmodSync(backup, 0o600);
    const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql;
    const extras = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
    const columns = db.prepare('PRAGMA table_info(users)').all().map(c => `"${c.name}"`).join(',');
    const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='users'").get()?.seq || 0;
    db.exec('PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE');
    try {
      db.exec(definition.replace(/CREATE TABLE (?:IF NOT EXISTS )?["`]?users["`]?/i, 'CREATE TABLE users_login_upgrade').replace(/email TEXT NOT NULL UNIQUE/i, 'email TEXT UNIQUE'));
      if(db.prepare('PRAGMA table_info(users_login_upgrade)').all().find(c=>c.name==='email')?.notnull)throw new Error('Unsupported users email schema; no data was changed');
      db.exec(`INSERT INTO users_login_upgrade(${columns}) SELECT ${columns} FROM users; DROP TABLE users; ALTER TABLE users_login_upgrade RENAME TO users;`);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='users'").run(sequence);
      for (const extra of extras) db.exec(extra.sql);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Login migration failed foreign-key verification');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    finally { db.exec('PRAGMA legacy_alter_table=OFF; PRAGMA foreign_keys=ON'); }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_identities (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('phone','wechat')), subject TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider,subject), UNIQUE(user_id,provider)
    );
    CREATE TABLE IF NOT EXISTS login_configuration (
      id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL,
      settings TEXT NOT NULL, secrets_cipher TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS login_challenges (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('sms','wechat')),
      purpose TEXT NOT NULL CHECK(purpose IN ('login','bind')), subject TEXT NOT NULL DEFAULT '',
      proof_hash TEXT NOT NULL, browser_hash TEXT NOT NULL DEFAULT '',
      user_id INTEGER REFERENCES users(id), token_version INTEGER,
      config_version INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL, result_user_id INTEGER REFERENCES users(id), result_version INTEGER,
      allow_create INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS login_challenge_expiry ON login_challenges(expires_at);
  `);
}
