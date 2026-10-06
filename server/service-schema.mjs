export function migrateService(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), draft_json TEXT NOT NULL,
      published_json TEXT, version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS service_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS support_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      order_id INTEGER REFERENCES orders(id), category TEXT NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id,request_key)
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL REFERENCES support_requests(id),
      author_id INTEGER NOT NULL REFERENCES users(id), author_type TEXT NOT NULL,
      message TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(request_id,author_id,request_key)
    );
    CREATE INDEX IF NOT EXISTS support_user_idx ON support_requests(user_id,id);
    CREATE INDEX IF NOT EXISTS support_status_idx ON support_requests(status,id);
    CREATE TABLE IF NOT EXISTS manual_refund_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
      actor_id INTEGER NOT NULL REFERENCES users(id), amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
      provider TEXT NOT NULL, provider_reference TEXT NOT NULL, returned_at TEXT NOT NULL,
      verification_note TEXT NOT NULL, rights_action TEXT NOT NULL,
      request_key TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider,provider_reference)
    );
    CREATE INDEX IF NOT EXISTS manual_refund_order_idx ON manual_refund_records(order_id,id);
    CREATE TABLE IF NOT EXISTS order_entitlement_grants (
      order_id INTEGER NOT NULL REFERENCES orders(id), user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('course','project')), target_id INTEGER NOT NULL,
      previous_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(order_id,kind,target_id)
    );
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id INTEGER NOT NULL REFERENCES users(id), notice_key TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,notice_key)
    );
  `);
  for(const table of ['entitlements','project_entitlements'])if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)&&!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='purchase_order_id'))db.exec(`ALTER TABLE ${table} ADD COLUMN purchase_order_id INTEGER REFERENCES orders(id)`);
}
