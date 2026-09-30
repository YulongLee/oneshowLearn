export function migrateAI(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_configuration (
    id INTEGER PRIMARY KEY CHECK(id=1), settings TEXT NOT NULL,
    key_mode TEXT NOT NULL DEFAULT 'environment', key_cipher TEXT,
    version INTEGER NOT NULL, updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ai_configuration_audit (
    id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), version INTEGER NOT NULL,
    changes TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ai_usage (
    id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
    model TEXT NOT NULL, config_version INTEGER NOT NULL, status TEXT NOT NULL,
    error_code TEXT, duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(created_at);
  CREATE INDEX IF NOT EXISTS ai_usage_user ON ai_usage(user_id,created_at);
  CREATE TABLE IF NOT EXISTS tutor_conversations (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tutor_conversations_owner ON tutor_conversations(user_id,updated_at);
  CREATE TABLE IF NOT EXISTS tutor_turns (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES tutor_conversations(id),
    question TEXT NOT NULL, mode TEXT NOT NULL, course_id INTEGER,
    include_product INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
    result_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tutor_turns_conversation ON tutor_turns(conversation_id,created_at);`);
}
