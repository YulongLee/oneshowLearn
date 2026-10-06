// Shared explicit/startup migration; no upload I/O or provider operations.
export function migrateUploads(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS asset_upload_sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),filename TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,manifest TEXT NOT NULL,digest TEXT NOT NULL,received INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'uploading',expires_at INTEGER NOT NULL,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,storage_checkpoint TEXT,asset_id INTEGER REFERENCES assets(id));CREATE INDEX IF NOT EXISTS asset_upload_owner ON asset_upload_sessions(user_id,digest);`);
}
