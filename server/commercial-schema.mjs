// Additive, provider-free migration. No catalogue, progress or historical grants modified.
export function migrateCommercial(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commercial_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), telemetry_enabled INTEGER NOT NULL DEFAULT 0,
      parser_enabled INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO commercial_settings(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL,
      kind TEXT NOT NULL, route TEXT NOT NULL, metric TEXT NOT NULL DEFAULT '', value REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS telemetry_time ON telemetry_events(created_at,kind);
    CREATE UNIQUE INDEX IF NOT EXISTS telemetry_performance_session ON telemetry_events(session_id,route,metric) WHERE kind='performance';
    CREATE TABLE IF NOT EXISTS certificate_policies (
      pack_id INTEGER PRIMARY KEY REFERENCES project_packs(id), enabled INTEGER NOT NULL DEFAULT 0,
      curriculum TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 0,
      actor_id INTEGER REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS completion_receipts (
      user_id INTEGER NOT NULL REFERENCES users(id), placement_id INTEGER NOT NULL REFERENCES lesson_placements(id),
      fingerprint TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,placement_id)
    );
    CREATE TABLE IF NOT EXISTS course_certificates (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), pack_id INTEGER NOT NULL REFERENCES project_packs(id),
      recipient TEXT NOT NULL, course_title TEXT NOT NULL, curriculum TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT, reason TEXT NOT NULL DEFAULT '',
      UNIQUE(user_id,pack_id)
    );
    CREATE TABLE IF NOT EXISTS document_parse_jobs (
      id TEXT PRIMARY KEY, asset_id INTEGER NOT NULL REFERENCES assets(id), actor_id INTEGER NOT NULL REFERENCES users(id),
      state TEXT NOT NULL DEFAULT 'submitting', batch_id TEXT NOT NULL DEFAULT '', upload_url TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', library_id INTEGER REFERENCES content_library(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, checked_at TEXT, attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS parse_jobs_state ON document_parse_jobs(state,checked_at);
    CREATE UNIQUE INDEX IF NOT EXISTS parse_jobs_active_asset ON document_parse_jobs(asset_id)
      WHERE state IN ('submitting','uploading','running','uncertain','review');
  `);
}
