// A genuinely empty database only: create the owner, not example course products.
process.env.DATABASE_AUTO_MIGRATE='false';
const {validateEnvironment}=await import('./environment.mjs');validateEnvironment(process.env);
const {db}=await import('../../server/db.mjs');
const {default:bcrypt}=await import('bcryptjs');
try {
  db.exec('BEGIN IMMEDIATE');
  for(const table of ['users','orders','project_packs','learning_paths','practice_projects'])if(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n)throw Error('Bootstrap refused: existing business records must be preserved');
  db.prepare("INSERT INTO users(email,password_hash,name,role,status,email_verified) VALUES(?,?,?,'admin','active',1)").run(process.env.ADMIN_EMAIL,bcrypt.hashSync(process.env.ADMIN_PASSWORD,12),'OneShowLearn 管理员');
  db.exec('COMMIT');console.log('Owner initialized; no sample users, orders or products');
} catch(e) {try{db.exec('ROLLBACK');}catch{}throw e;} finally {db.close();}
