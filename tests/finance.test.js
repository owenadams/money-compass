import test from 'node:test';
import assert from 'node:assert/strict';
import { assessment, estimateInterest, isStale, selectProducts } from '../src/finance.js';

const now = new Date('2026-10-05T12:00:00Z');
const account = { id: 'test', provider: 'Test', category: 'Savings', risk: 'Cash', rate: 4.5, rateKind: 'AER', rateCheckedAt: '2026-10-05', access: 'Easy access', minimum: 1, maximum: 100000, bonusMonths: 12 };

test('withdrawal restrictions cannot receive easy-access assessment', () => {
  assert.equal(assessment(account, 10000, now).label, 'Worth comparing');
  assert.equal(assessment({ ...account, access: 'Limited access' }, 10000, now).label, 'Not for emergency money');
});
test('stale, failed and changed terms are not recommended', () => {
  for (const changes of [{ rateCheckedAt: '2026-09-01' }, { checkStatus: 'failed' }, { termsChanged: true }]) {
    assert.equal(assessment({ ...account, ...changes }, 10000, now).label, 'Needs checking');
  }
  assert.equal(isStale('bad date', now), true);
});
test('estimates exclude capped deposits, short bonuses and prize rates', () => {
  assert.equal(estimateInterest(account, 10000), 450);
  assert.equal(estimateInterest({ ...account, maximum: 3000 }, 10000), null);
  assert.equal(estimateInterest({ ...account, bonusMonths: 6 }, 10000), null);
  assert.equal(estimateInterest({ ...account, rateKind: 'Prize fund' }, 10000), null);
});
test('rank only current eligible AERs and keep investment returns separate', () => {
  const products = [account, { ...account, id: 'capped', rate: 8, maximum: 3000 }, { ...account, id: 'old', rate: 9, rateCheckedAt: '2026-09-01' }];
  assert.equal(selectProducts(products, { amount: 10000, sort: 'rate' }, now)[0].id, 'test');
  assert.equal(assessment({ ...account, risk: 'Investment' }, 10000, now).label, 'Research first');
});
test('ISA subscription limits are not treated as maximum balances', () => {
  const isa = { ...account, category: 'Cash ISAs', maximum: null, annualContributionLimit: 20000 };
  assert.equal(assessment(isa, 30000, now).label, 'Worth comparing');
  assert.equal(estimateInterest(isa, 30000), 1350);
});