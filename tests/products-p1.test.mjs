import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateProductMutation } from '../worker/operations.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');

function makeEnv({ duplicate = null, references = 0, client = true, projects = {} } = {}) {
  return {
    DB:{
      prepare(sql){
        return {
          bind(...args){
            return {
              async first(){
                if (/COUNT\(\*\)/.test(sql)) return { count:references };
                if (/FROM core_projects/.test(sql)) {
                  const id = args[1];
                  return projects[id] || null;
                }
                if (/FROM core_clients/.test(sql)) return client ? { id:args[1] } : null;
                if (/FROM core_products/.test(sql) && /lower\(sku\)/.test(sql)) return duplicate;
                return null;
              }
            };
          }
        };
      }
    }
  };
}

test('Products P1 backend validates project/client, SKU and numeric fields', async () => {
  const env = makeEnv({ projects:{'PRJ-1':{id:'PRJ-1',client_id:'CL-1'}} });
  const row = { id:'PRD-1', name:'Produk A', sku:'SKU-1', unit:'pcs', clientId:'CL-1', projectIds:['PRJ-1'], status:'active', price:1000, cost:500, margin:50 };
  assert.equal(await validateProductMutation(env,'ORG-1',row,null,{op:'upsert',existingProjectIds:[]}),null);

  const badMargin={...row,margin:120};
  assert.equal((await validateProductMutation(env,'ORG-1',badMargin,null,{op:'upsert'})).error,'PRODUCT_INVALID_MARGIN');

  const mismatch={...row,clientId:'CL-2'};
  assert.equal((await validateProductMutation(env,'ORG-1',mismatch,null,{op:'upsert'})).error,'PRODUCT_PROJECT_CLIENT_MISMATCH');

  const dupEnv=makeEnv({duplicate:{id:'PRD-OTHER'},projects:{'PRJ-1':{id:'PRJ-1',client_id:'CL-1'}}});
  assert.equal((await validateProductMutation(dupEnv,'ORG-1',{...row},null,{op:'upsert'})).error,'PRODUCT_SKU_CONFLICT');
});

test('Products P1 backend blocks hard delete when operational references exist', async () => {
  const env=makeEnv({references:1});
  const result=await validateProductMutation(env,'ORG-1',{id:'PRD-1'}, {id:'PRD-1'}, {op:'delete'});
  assert.equal(result.error,'PRODUCT_REFERENCED_USE_INACTIVE');
  assert.equal(result.status,409);
  assert.ok(result.referenceCount >= 1);
});

test('Products P1 local model sanitizes and preserves history through inactive lifecycle', () => {
  assert.match(db,/function validateProductLocal/);
  assert.match(db,/SKU sudah digunakan pada klien ini/);
  assert.match(db,/export function productReferenceSummary/);
  assert.match(db,/status:'inactive'/);
  assert.match(db,/return \{ deleted:false, deactivated:true, references \}/);
});

test('Products P1 UI escapes stored product output and form values', () => {
  for (const marker of [
    'value="${esc(model.name)}"',
    'value="${esc(model.brand)}"',
    'value="${esc(model.sku)}"',
    '${esc(p.sku)}',
    '${esc(p.name)}',
    "${esc(p.brand||'—')}",
    "${esc(p.category||'—')}",
  ]) assert.ok(app.includes(marker), marker);
  assert.match(app,/FT\.editProduct\(\$\{jsArg\(p\.id\)\}\)/);
  assert.match(app,/FT\.deleteProductConfirm\(\$\{jsArg\(p\.id\)\}\)/);
});

test('Products P1 create update delete wait for cloud authority and rollback failures', () => {
  const start=Math.max(app.indexOf('window.FT.createProduct = async function'), app.indexOf('window.FT.createProduct=async function'));
  const end=app.indexOf('// ===== Stocks Page',start);
  const block=app.slice(start,end);
  assert.match(block,/await waitForOperationalSync\(\)/);
  assert.match(block,/restoreOperationalBaseline\(getDB\(\)\)/);
  assert.match(block,/productReferenceSummary\(id\)/);
  assert.match(block,/Produk dinonaktifkan dan histori tetap dipertahankan/);
});

test('Products P1 worker wires authoritative validator into sync path', () => {
  assert.match(worker,/if \(entity === 'products'\)/);
  assert.match(worker,/validateProductMutation\(env, organizationId, row, existing, \{ op, existingProjectIds \}\)/);
  assert.match(worker,/PRODUCT_REFERENCED_USE_INACTIVE/);
});
