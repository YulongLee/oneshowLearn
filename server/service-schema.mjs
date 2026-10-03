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
  `);
}
