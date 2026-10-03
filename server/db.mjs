import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.mjs";
import {migrateLearning} from './learning-schema.mjs';
import {migrateAI} from './ai-schema.mjs';
import {migratePayments} from './payment-schema.mjs';
import {migrateLogin} from './login-schema.mjs';
import {migrateService} from './service-schema.mjs';

mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cms_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      entity TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'learner' CHECK(role IN ('learner','editor','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS learning_paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '入门',
      icon TEXT NOT NULL DEFAULT 'sparkle',
      color TEXT NOT NULL DEFAULT 'violet',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_packs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path_id INTEGER NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      deliverable TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      is_featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pack_id INTEGER NOT NULL REFERENCES project_packs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('document','prompt','code','template','task','checklist','video','download')),
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      resource_url TEXT NOT NULL DEFAULT '',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      is_preview INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      url TEXT NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS asset_storage (
      asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider='oss'),
      bucket TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      object_key TEXT NOT NULL,
      etag TEXT NOT NULL DEFAULT '',
      header_hex TEXT NOT NULL DEFAULT '',
      UNIQUE(bucket,object_key)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pack_id INTEGER NOT NULL UNIQUE REFERENCES project_packs(id) ON DELETE CASCADE,
      sku TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','refunded')),
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      price_cents INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'manual',
      provider_reference TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','succeeded','failed','refunded')),
      amount_cents INTEGER NOT NULL,
      raw_payload TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pack_id INTEGER NOT NULL REFERENCES project_packs(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'purchase',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
      starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      UNIQUE(user_id, pack_id)
    );

    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_item_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','completed')),
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, content_item_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL DEFAULT '{"tasks":[],"notes":[],"favorites":[],"checkIns":[]}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opc_stage_steps (
      step_id INTEGER PRIMARY KEY REFERENCES project_steps(id) ON DELETE CASCADE,
      phase INTEGER NOT NULL CHECK(phase BETWEEN 1 AND 5)
    );
    CREATE TABLE IF NOT EXISTS opc_products (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      pending_name TEXT NOT NULL,
      pending_password_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_packs_path ON project_packs(path_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_steps_pack ON project_steps(pack_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_content_step ON content_items(step_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_verification_email ON email_verification_codes(email, created_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_codes(email, created_at);

    CREATE TABLE IF NOT EXISTS account_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')),
      code_hash TEXT NOT NULL,
      pending_name TEXT NOT NULL DEFAULT '',
      pending_password_hash TEXT NOT NULL DEFAULT '',
      token_version INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_account_codes_email ON account_codes(email,purpose,id);
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key TEXT PRIMARY KEY,
      hits INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_limit_expiry ON auth_rate_limits(expires_at);
    CREATE TABLE IF NOT EXISTS email_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      purpose TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_code TEXT NOT NULL DEFAULT '',
      message_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS account_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      target_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      resource_url TEXT NOT NULL DEFAULT '', duration_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS practice_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', cover_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other', tags TEXT NOT NULL DEFAULT '[]',
      deliverable TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS practice_project_courses (
      project_id INTEGER NOT NULL REFERENCES practice_projects(id) ON DELETE CASCADE,
      pack_id INTEGER NOT NULL REFERENCES project_packs(id) ON DELETE RESTRICT,
      sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(project_id,pack_id)
    );
    CREATE TABLE IF NOT EXISTS site_pages (
      key TEXT PRIMARY KEY, draft_json TEXT NOT NULL, published_json TEXT,
      version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS site_page_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, page_key TEXT NOT NULL,
      payload TEXT NOT NULL, actor_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if(!db.prepare('PRAGMA table_info(content_items)').all().some(c=>c.name==='library_id'))
    db.exec('ALTER TABLE content_items ADD COLUMN library_id INTEGER REFERENCES content_library(id) ON DELETE RESTRICT');
  db.exec(`
    CREATE VIEW IF NOT EXISTS published_content_items AS
      SELECT ci.* FROM content_items ci LEFT JOIN content_library l ON l.id=ci.library_id
      WHERE ci.library_id IS NULL OR l.status='published';
    CREATE TRIGGER IF NOT EXISTS library_sync AFTER UPDATE ON content_library BEGIN
      UPDATE content_items SET title=NEW.title,type=NEW.type,body=NEW.body,resource_url=NEW.resource_url,
        duration_seconds=NEW.duration_seconds,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE library_id=NEW.id;
    END;
    CREATE INDEX IF NOT EXISTS idx_content_library ON content_items(library_id);
    CREATE TRIGGER IF NOT EXISTS library_reference_guard BEFORE UPDATE ON content_items
      WHEN NEW.library_id IS NOT NULL AND EXISTS(SELECT 1 FROM content_library l WHERE l.id=NEW.library_id AND
        (NEW.title!=l.title OR NEW.type!=l.type OR NEW.body!=l.body OR NEW.resource_url!=l.resource_url OR NEW.duration_seconds!=l.duration_seconds))
      BEGIN SELECT RAISE(ABORT,'Shared content must be edited in the library'); END;
  `);
  if (!userColumns.some((column) => column.name === "email_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.some((column) => column.name === "token_version")) {
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.some((column) => column.name === "last_login_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }
}

export function rows(statement, params = {}) {
  const prepared = db.prepare(statement);
  return Array.isArray(params) ? prepared.all(...params) : prepared.all(params);
}

export function row(statement, params = {}) {
  const prepared = db.prepare(statement);
  return Array.isArray(params) ? prepared.get(...params) : prepared.get(params);
}

export function run(statement, params = {}) {
  const prepared = db.prepare(statement);
  return Array.isArray(params) ? prepared.run(...params) : prepared.run(params);
}

migrate();
migrateLearning(db);
migrateAI(db);
migratePayments(db);
migrateLogin(db, config.databasePath);
migrateService(db);
