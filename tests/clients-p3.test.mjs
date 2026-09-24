import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CLIENT_PAGE_SIZE,
  clientStatusLabel,
  normalizeClientWebsite,
  clientSyncState,
  clientMatchesFilters,
  paginateClients,
  normalizeAdditionalPics,
  clientSearchDocument,
} from '../src/lib/client-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Client P3 helpers normalize labels and website safely', () => {
  assert.equal(clientStatusLabel('active'),'Aktif');
  assert.equal(normalizeClientWebsite('example.com'),'https://example.com/');
  assert.equal(normalizeClientWebsite('javascript:alert(1)'),'');
});

test('Client P3 filtering and pagination are deterministic', () => {
  const clients=[
    {name:'Alpha Retail',status:'active',city:'Jakarta'},
    {name:'Beta Pharma',status:'prospect',city:'Bandung'},
  ];
  assert.equal(clientMatchesFilters(clients[0],{search:'alpha',status:'active'}),true);
  assert.equal(clientMatchesFilters(clients[1],{search:'alpha',status:''}),false);
  const page=paginateClients(Array.from({length:31},(_,i)=>i),3,CLIENT_PAGE_SIZE);
  assert.equal(page.currentPage,3);
  assert.equal(page.pageCount,3);
  assert.equal(page.from,31);
  assert.equal(page.to,31);
  assert.deepEqual(page.items,[30]);
});

test('Client P3 sync state is presentation-independent', () => {
  assert.deepEqual(clientSyncState({cutoverMode:'cloud',ready:true}),{label:'Tersinkron cloud',tone:'ok'});
  assert.equal(clientSyncState({syncing:true}).tone,'progress');
  assert.equal(clientSyncState({error:'REVISION_CONFLICT'}).tone,'error');
});

test('Client P3 normalizes structured PIC rows', () => {
  assert.deepEqual(normalizeAdditionalPics({
    names:[' Dimas ',''],
    roles:['Trade',''],
    phones:['0812',''],
    emails:['dimas@example.com',''],
  }),[{name:'Dimas',role:'Trade',phone:'0812',email:'dimas@example.com'}]);
});

test('Client P3 search document is reusable outside DOM', () => {
  assert.equal(clientSearchDocument({name:'Alpha',legalName:'PT Alpha',picName:'Rina',city:'Jakarta',province:'DKI'}),'alpha pt alpha rina jakarta dki');
});

test('Client P3 module is wired into page and PWA runtime', async () => {
  const src=await read('src/types/index.js');
  const sw=await read('sw.js');
  assert.match(src,/from "\.\.\/lib\/client-ui\.js"/);
  assert.match(src,/paginateClients\(matched, page, CLIENT_PAGE_SIZE\)/);
  assert.match(src,/normalizeAdditionalPics/);
  assert.match(sw,/src\/lib\/client-ui\.js/);
  assert.match(sw,/proqtrack-v12\.42/);
});
