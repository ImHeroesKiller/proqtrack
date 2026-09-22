import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleBulkMasterRoute } from '../worker/bulk-master.js';
import { handleOperationalRoute, authorizeOperationalChange } from '../worker/operations.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE core_organizations(id TEXT PRIMARY KEY);
    INSERT INTO core_organizations VALUES('ORG'),('OTHER');
    CREATE TABLE core_sync_state(organization_id TEXT PRIMARY KEY,revision INTEGER,cutover_mode TEXT,last_mutation_id TEXT,imported_at TEXT,updated_at TEXT);
    INSERT INTO core_sync_state VALUES('ORG',0,'cloud',NULL,NULL,NULL),('OTHER',0,'cloud',NULL,NULL,NULL);
    CREATE TABLE core_sync_mutations(organization_id TEXT,mutation_id TEXT,actor_user_id TEXT,base_revision INTEGER,applied_revision INTEGER,change_count INTEGER,PRIMARY KEY(organization_id,mutation_id));
    CREATE TABLE core_employees(id TEXT,organization_id TEXT);
    CREATE TABLE core_clients(id TEXT,organization_id TEXT);
    CREATE TABLE core_projects(id TEXT,organization_id TEXT);
    CREATE TABLE core_outlets(id TEXT,organization_id TEXT,UNIQUE(id,organization_id));
    CREATE TABLE core_products(id TEXT,organization_id TEXT);
  `);
  db.exec(readFileSync(new URL('../migrations/0017_master_bulk_cloud_authority.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0018_bulk_release_safety.sql',import.meta.url),'utf8'));
  let beforeBatch;
  const env = {CORE_BULK_API_ENABLED:'true',CORE_DATA_API_ENABLED:'true',DB:{
    prepare(sql) {
      return { sql,args:[],bind(...args){this.args=args;return this;},
        async all(){return {results:db.prepare(sql).all(...this.args)};},
        async first(){return db.prepare(sql).get(...this.args)||null;},
        async run(){return db.prepare(sql).run(...this.args);}};
    },
    async batch(statements) {
      if (beforeBatch) { const action=beforeBatch; beforeBatch=null; action(); }
      db.exec('BEGIN');
      try { const result=statements.map(s=>db.prepare(s.sql).run(...s.args));db.exec('COMMIT');return result; }
      catch(error){db.exec('ROLLBACK');throw error;}
    },
  }};
  const claims={sub:'USER',organizationId:'ORG',role:'head',projectIds:[]};
  const send=async(body,actor=claims)=>{
    const req=new Request('https://test/api/bulk/master/commit',{method:'POST',body:JSON.stringify(body)});
    return handleBulkMasterRoute(req,env,actor);
  };
  return {db,env,claims,send,beforeBatch:fn=>{beforeBatch=fn;}};
}
const body=(extra={})=>({entity:'competitors',importId:'IMPORT',chunkId:'1',totalChunks:1,rows:[{code:'CMP',name:'Original'}],...extra});

test('committed chunks replay exact counters and reject changed payload without writing',async()=>{
  const f=fixture();
  assert.equal((await f.send(body())).status,200);
  const replay=await (await f.send(body())).json();
  assert.equal(replay.idempotent,true);assert.equal(replay.summary.inserts,1);
  assert.equal((await f.send(body({rows:[{code:'CMP',name:'Changed'}]}))).status,409);
  assert.equal(f.db.prepare('SELECT name FROM core_competitors').get().name,'Original');
  assert.equal(f.db.prepare('SELECT revision FROM core_sync_state WHERE organization_id=?').get('ORG').revision,1);
});
test('sequence requires previous chunks and freezes the declared import length',async()=>{
  const f=fixture();
  assert.equal((await f.send(body({chunkId:'2',totalChunks:2}))).status,409);
  assert.equal((await f.send(body({totalChunks:2}))).status,200);
  assert.equal((await f.send(body({chunkId:'2',totalChunks:3}))).status,409);
  assert.equal((await f.send(body({chunkId:'2',totalChunks:2,rows:[{code:'CMP2',name:'Second'}]}))).status,200);
  assert.equal((await f.send(body({chunkId:'3',totalChunks:3}))).status,409);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM core_master_bulk_receipts').get().n,2);
});
test('same import id is isolated by organization and actor; managers cannot write catalogs',async()=>{
  const f=fixture();
  await f.send(body());
  const second=await (await f.send(body(),{...f.claims,sub:'USER2'})).json();
  assert.equal(second.summary.updates,1);assert.equal(second.idempotent,false);
  assert.equal((await f.send(body(),{...f.claims,organizationId:'OTHER'})).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM core_competitors').get().n,2);
  assert.equal((await f.send(body(),{...f.claims,role:'manager'})).status,403);
  for(const entity of ['competitors','competitorProducts']) assert.equal(authorizeOperationalChange({...f.claims,role:'manager'},entity,{row:{id:'x'}}),false);
});
test('SQL failure rolls back data, receipt and revision together',async()=>{
  const f=fixture();
  f.db.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON core_master_bulk_receipts BEGIN SELECT RAISE(ABORT,'injected failure'); END;`);
  await assert.rejects(f.send(body()),/injected failure/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM core_competitors').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM core_sync_mutations').get().n,0);
  assert.equal(f.db.prepare('SELECT revision FROM core_sync_state WHERE organization_id=?').get('ORG').revision,0);
});
test('writer race fails atomically and retry uses fresh state',async()=>{
  const f=fixture();
  f.beforeBatch(()=>f.db.exec(`UPDATE core_sync_state SET revision=1 WHERE organization_id='ORG'`));
  const response=await f.send(body());assert.equal(response.status,409);
  assert.equal((await response.json()).error,'REVISION_CONFLICT');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM core_competitors').get().n,0);
  assert.equal((await f.send(body())).status,200);
});
test('catalog delete archives parent and preserves child products',async()=>{
  const f=fixture();await f.send(body());
  const parent=f.db.prepare('SELECT id FROM core_competitors').get().id;
  f.db.prepare(`INSERT INTO core_competitor_products(id,organization_id,competitor_id,sku,name) VALUES('CHILD','ORG',?,'SKU','Child')`).run(parent);
  const request=new Request('https://test/api/core/sync',{method:'POST',body:JSON.stringify({mutationId:'archive',baseRevision:1,changes:[{entity:'competitors',op:'delete',row:{id:parent}}]})});
  assert.equal((await handleOperationalRoute(request,f.env,f.claims)).status,200);
  assert.equal(f.db.prepare('SELECT status FROM core_competitors').get().status,'archived');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM core_competitor_products').get().n,1);
});
test('shared product retains both project links and rejects a single-project manager',async()=>{
  const f=fixture();
  f.db.exec(`ALTER TABLE core_projects ADD COLUMN code TEXT;
    ALTER TABLE core_projects ADD COLUMN client_id TEXT;
    INSERT INTO core_projects(id,organization_id,code,client_id) VALUES('P1','ORG','P1','C'),('P2','ORG','P2','C');
    DROP TABLE core_products;
    CREATE TABLE core_products(id TEXT PRIMARY KEY,organization_id TEXT,client_id TEXT,sku TEXT,name TEXT,unit TEXT,status TEXT,metadata_json TEXT,row_version INTEGER,updated_at TEXT);
    INSERT INTO core_products VALUES('PROD','ORG','C','SKU','Original','pcs','active','{}',1,NULL);
    CREATE TABLE core_project_products(organization_id TEXT,project_id TEXT,product_id TEXT,status TEXT,updated_at TEXT);
    INSERT INTO core_project_products VALUES('ORG','P1','PROD','active',NULL),('ORG','P2','PROD','active',NULL);`);
  const input=body({entity:'products',rows:[{sku:'SKU',name:'Updated',project_code:'P1'}]});
  assert.equal((await f.send(input,{...f.claims,role:'manager',projectIds:['P1']})).status,403);
  assert.equal((await f.send(input)).status,200);
  assert.deepEqual(f.db.prepare('SELECT project_id FROM core_project_products ORDER BY project_id').all().map(r=>r.project_id),['P1','P2']);
});
