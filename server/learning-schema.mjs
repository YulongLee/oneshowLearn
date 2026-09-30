// Never creates catalog content or user enrollments. Existing IDs are preserved.
function migrateLearningCore(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  if (
    db
      .prepare("SELECT name FROM schema_migrations WHERE name=?")
      .get("20260929-learning-v1")
  )
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE project_categories (
        id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE practice_project_settings (
        project_id INTEGER PRIMARY KEY REFERENCES practice_projects(id) ON DELETE RESTRICT,
        category_id INTEGER REFERENCES project_categories(id), tech_stack TEXT NOT NULL DEFAULT '[]',
        difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5), estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK(estimated_minutes>=0),
        audience TEXT NOT NULL DEFAULT '', prerequisites TEXT NOT NULL DEFAULT '',
        access_type TEXT NOT NULL DEFAULT 'paid' CHECK(access_type IN ('free','paid','membership')),
        is_recommended INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE practice_project_stages (
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES practice_projects(id) ON DELETE RESTRICT,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', checklist TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE learning_lessons (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
        config TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
        version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE lesson_placements (
        id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES learning_lessons(id) ON DELETE RESTRICT,
        chapter_id INTEGER REFERENCES project_steps(id) ON DELETE RESTRICT,
        stage_id INTEGER REFERENCES practice_project_stages(id) ON DELETE RESTRICT,
        is_preview INTEGER NOT NULL DEFAULT 0 CHECK(is_preview IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')), version INTEGER NOT NULL DEFAULT 1,
        CHECK ((chapter_id IS NULL)!=(stage_id IS NULL)), UNIQUE(chapter_id,lesson_id), UNIQUE(stage_id,lesson_id)
      );
      CREATE TABLE lesson_materials (
        placement_id INTEGER NOT NULL REFERENCES lesson_placements(id) ON DELETE RESTRICT,
        library_id INTEGER NOT NULL REFERENCES content_library(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK(role IN ('article','code','prompt','file','transcript')),
        sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(placement_id,library_id)
      );
      CREATE TABLE learning_progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        placement_id INTEGER NOT NULL REFERENCES lesson_placements(id) ON DELETE RESTRICT,
        video_time REAL NOT NULL DEFAULT 0 CHECK(video_time>=0), slide_id TEXT, follow_video INTEGER NOT NULL DEFAULT 1,
        tasks TEXT NOT NULL DEFAULT '[]', completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id,placement_id)
      );
      CREATE TABLE learning_notes (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        placement_id INTEGER NOT NULL REFERENCES lesson_placements(id) ON DELETE RESTRICT,
        title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', video_time REAL CHECK(video_time>=0), slide_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX learning_notes_owner ON learning_notes(user_id,placement_id,updated_at);
      CREATE TABLE project_runs (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        project_id INTEGER NOT NULL REFERENCES practice_projects(id) ON DELETE RESTRICT,
        current_placement_id INTEGER REFERENCES lesson_placements(id), current_prompt_id INTEGER REFERENCES content_library(id),
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version INTEGER NOT NULL DEFAULT 1, UNIQUE(user_id,project_id)
      );
      CREATE TABLE project_stage_acceptances (
        run_id INTEGER NOT NULL REFERENCES project_runs(id), stage_id INTEGER NOT NULL REFERENCES practice_project_stages(id),
        stage_version INTEGER NOT NULL, checked_items TEXT NOT NULL, accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(run_id,stage_id)
      );
      CREATE TABLE prompt_revisions (
        id INTEGER PRIMARY KEY, library_id INTEGER NOT NULL REFERENCES content_library(id),
        version INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(library_id,version)
      );
      CREATE TABLE lesson_prompt_versions (
        placement_id INTEGER NOT NULL REFERENCES lesson_placements(id), library_id INTEGER NOT NULL REFERENCES content_library(id),
        revision_id INTEGER NOT NULL REFERENCES prompt_revisions(id), PRIMARY KEY(placement_id,library_id)
      );
    `);
    db.prepare("INSERT INTO schema_migrations(name) VALUES(?)").run(
      "20260929-learning-v1",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateLearningCommerce(db) {
  migrateLearningCore(db);
  if (
    db
      .prepare("SELECT 1 FROM schema_migrations WHERE name=?")
      .get("20260929-learning-commerce-v2")
  )
    return;
  // SQLite requires a table swap to make pack_id nullable. The existing product
  // IDs and every order reference survive; foreign keys are checked before commit.
  db.exec("PRAGMA foreign_keys=OFF");
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE products_learning_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pack_id INTEGER UNIQUE REFERENCES project_packs(id) ON DELETE CASCADE,
        project_id INTEGER UNIQUE REFERENCES practice_projects(id) ON DELETE RESTRICT,
        sku TEXT NOT NULL UNIQUE,title TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>=0),
        currency TEXT NOT NULL DEFAULT 'CNY',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK((pack_id IS NULL)!=(project_id IS NULL))
      );
      INSERT INTO products_learning_next(id,pack_id,sku,title,price_cents,currency,status,created_at,updated_at)
        SELECT id,pack_id,sku,title,price_cents,currency,status,created_at,updated_at FROM products;
      DROP TABLE products;
      ALTER TABLE products_learning_next RENAME TO products;
      CREATE TABLE project_entitlements (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        project_id INTEGER NOT NULL REFERENCES practice_projects(id) ON DELETE RESTRICT,
        source TEXT NOT NULL DEFAULT 'purchase', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
        starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT,
        UNIQUE(user_id,project_id)
      );
    `);
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw Error(
        "Learning commerce migration failed foreign key verification",
      );
    db.prepare("INSERT INTO schema_migrations(name) VALUES(?)").run(
      "20260929-learning-commerce-v2",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}

export function migrateLearning(db) {
  migrateLearningCommerce(db);
  if (
    db
      .prepare("SELECT 1 FROM schema_migrations WHERE name=?")
      .get("20260929-learning-progress-v3")
  )
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`ALTER TABLE learning_progress ADD COLUMN video_duration REAL NOT NULL DEFAULT 0;
    ALTER TABLE learning_progress ADD COLUMN current_prompt_id INTEGER REFERENCES content_library(id);`);
    db.prepare("INSERT INTO schema_migrations(name) VALUES(?)").run(
      "20260929-learning-progress-v3",
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
