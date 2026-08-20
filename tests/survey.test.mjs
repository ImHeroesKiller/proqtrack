import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword } from '../src/lib/utils.js';

installBrowserShim();

const {
  getDB, resetDB, __resetForTests, authenticate,
  createSurveyTemplate, updateSurveyTemplate, assignSurvey,
  surveysForField, saveSurveyDraft, submitSurveyResponse,
  productSalesAnalytics, createProductSale,
} = await import('../src/lib/db.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

function login(email, dev = device('DEV-SV-1')) {
  const acc = authenticate(email, TEST_PASSWORD, dev);
  assert.ok(acc, `login failed ${email}`);
  setSession(acc);
  return acc;
}

test('schema v18 catalogs surveys', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  assert.equal(getDB()._version, 18);
  assert.ok(Array.isArray(getDB().surveyTemplates));
  assert.ok(Array.isArray(getDB().surveyResponses));
});

test('head can create, activate, and field sales can submit once', () => {
  prepare();
  login('manager@proqtrack.id');
  const survey = createSurveyTemplate({
    name: 'Shelf check',
    questions: [{ id: 'Q1', label: 'In stock?', type: 'yes_no', required: true, order: 0 }],
  });
  updateSurveyTemplate(survey.id, { status: 'active' });
  assignSurvey({ surveyId: survey.id, employeeId: 'EMP001' });

  login('budi.santoso@proqtrack.id', device('DEV-SV-2'));
  const list = surveysForField('EMP001');
  assert.ok(list.some(s => s.id === survey.id));
  saveSurveyDraft({ surveyId: survey.id, answers: { Q1: '' } });
  const submitted = submitSurveyResponse({ surveyId: survey.id, answers: { Q1: 'yes' } });
  assert.equal(submitted.status, 'submitted');
  assert.throws(() => submitSurveyResponse({ surveyId: survey.id, answers: { Q1: 'yes' } }), /Already submitted/);
});

test('required validation and expired survey are rejected', () => {
  prepare();
  login('manager@proqtrack.id');
  const survey = createSurveyTemplate({
    name: 'Expired',
    questions: [{ id: 'Q1', label: 'Note', type: 'short_text', required: true, order: 0 }],
  });
  updateSurveyTemplate(survey.id, { status: 'active', endDate: '2020-01-01' });
  login('budi.santoso@proqtrack.id', device('DEV-SV-3'));
  assert.throws(() => submitSurveyResponse({ surveyId: survey.id, answers: { Q1: 'x' } }), /expired/);
});

test('product sales stamp sku and analytics respect ACL', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const product = getDB().products.find(p => p.status === 'active');
  const sale = createProductSale({ employeeId: 'EMP001', productId: product.id, qty: 2, unitPrice: 1000 });
  assert.equal(sale.amount, 2000);
  assert.equal(sale.sku, product.sku);
  const analytics = productSalesAnalytics();
  assert.ok(analytics.total >= 2000);
});
