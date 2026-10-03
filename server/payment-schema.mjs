export function migratePayments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_configuration (
      version INTEGER PRIMARY KEY, settings TEXT NOT NULL, secrets_cipher TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payment_checkouts (
      order_id INTEGER PRIMARY KEY REFERENCES orders(id), user_id INTEGER NOT NULL REFERENCES users(id),
      product_id INTEGER NOT NULL REFERENCES products(id), provider TEXT NOT NULL CHECK(provider IN ('wechat','alipay')),
      config_version INTEGER NOT NULL REFERENCES payment_configuration(version), request_key TEXT NOT NULL,
      code_url TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, last_sync_at INTEGER NOT NULL DEFAULT 0,
      provider_reference TEXT, failure_code TEXT NOT NULL DEFAULT '',
      UNIQUE(user_id,request_key), UNIQUE(provider,provider_reference)
    );
    CREATE INDEX IF NOT EXISTS payment_checkout_owner ON payment_checkouts(user_id,product_id,order_id);
  `);
  const columns=db.prepare('PRAGMA table_info(payment_checkouts)').all().map(c=>c.name);
  for(const [name,type] of Object.entries({payment_flow:"TEXT NOT NULL DEFAULT 'qr' CHECK(payment_flow IN ('qr','page'))",page_issued_at:'INTEGER NOT NULL DEFAULT 0',attempt_state:"TEXT NOT NULL DEFAULT 'legacy'",provider_code:"TEXT NOT NULL DEFAULT ''",provider_trace:"TEXT NOT NULL DEFAULT ''",failure_at:'INTEGER NOT NULL DEFAULT 0',next_sync_at:'INTEGER NOT NULL DEFAULT 0',sync_attempts:'INTEGER NOT NULL DEFAULT 0'})){
    if(!columns.includes(name))db.exec(`ALTER TABLE payment_checkouts ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS payment_checkout_locks(user_id INTEGER PRIMARY KEY REFERENCES users(id),token TEXT NOT NULL,lease_until INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS payment_checkout_requests(user_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,order_id INTEGER NOT NULL REFERENCES orders(id),provider TEXT NOT NULL,PRIMARY KEY(user_id,request_key));
    CREATE TABLE IF NOT EXISTS payment_events(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),stage TEXT NOT NULL,code TEXT NOT NULL,trace TEXT NOT NULL DEFAULT '',verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS payment_checkout_due ON payment_checkouts(next_sync_at,order_id);`);
}
