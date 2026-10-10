// One-time course redemption codes. Plaintext codes are never persisted.
export function migrateRedemptionCodes(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS redemption_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL UNIQUE,
      code_last4 TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','revoked')),
      expires_at TEXT,
      used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      used_at TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS redemption_codes_status ON redemption_codes(status,product_id);
    CREATE INDEX IF NOT EXISTS redemption_codes_used_by ON redemption_codes(used_by,used_at);
  `);
}
