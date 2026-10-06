// Explicit schema upgrade only. Never seed, reset passwords or call providers.
process.env.DATABASE_AUTO_MIGRATE='false';
const {validateEnvironment}=await import('./environment.mjs');
validateEnvironment(process.env);
const {db,applyMigrations}=await import('../../server/db.mjs');
try {
  applyMigrations();
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database integrity verification failed');
  console.log('Schema migration and integrity checks passed; no catalogue initialized');
} finally {db.close();}
