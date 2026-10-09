// Offline operations only. No application import, migrations or provider calls.
import {DatabaseSync} from 'node:sqlite';
import {chmodSync} from 'node:fs';
const [operation,destination]=process.argv.slice(2),db=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:true});
try {
  if(operation==='check') {
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database integrity failed');
    console.log('Database integrity passed');
  } else if(operation==='idle') {
    const checks=["SELECT COUNT(*) n FROM payment_checkout_locks WHERE lease_until>unixepoch()","SELECT COUNT(*) n FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE o.status='pending' AND c.next_sync_at>0","SELECT COUNT(*) n FROM ai_usage WHERE status='pending' AND julianday(created_at)>julianday('now','-5 minutes')","SELECT COUNT(*) n FROM tutor_turns WHERE status='pending' AND julianday(updated_at)>julianday('now','-5 minutes')","SELECT COUNT(*) n FROM asset_upload_sessions WHERE lease_until>0 AND lease_until>unixepoch()*1000"];
    for(const sql of checks)if(db.prepare(sql).get().n)throw Error('Active operation: maintenance deferred, no leases or orders changed');
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_parse_jobs'").get()&&db.prepare("SELECT COUNT(*) n FROM document_parse_jobs WHERE state IN ('submitting','uploading','running','uncertain')").get().n)throw Error('Active or uncertain document parsing: maintenance deferred');
    console.log('No active financial/model/upload operations');
  } else if(operation==='snapshot'&&/^\/app\/data\/snapshot-[a-f0-9-]+\.db$/.test(destination||'')) {
    db.prepare('VACUUM INTO ?').run(destination);chmodSync(destination,0o600);console.log('Consistent database snapshot created');
  } else throw Error('Unsupported database operation');
}finally{db.close();}
