import test from 'node:test';
import assert from 'node:assert/strict';
import { assessment, estimateInterest, isStale, selectProducts, switchingComparison } from '../src/finance.js';
import { catalogue } from '../src/catalogue.js';

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
test('listed rates sort descending without hiding unverified rates in alphabetical order', () => {
  const products = [account, { ...account, id: 'capped', rate: 8, maximum: 3000 }, { ...account, id: 'old', rate: 9, rateCheckedAt: '2026-09-01' }];
  assert.deepEqual(selectProducts(products, { amount: 10000, sort: 'rate' }, now).map(product => product.id), ['old', 'test', 'capped']);
  assert.equal(assessment({ ...account, risk: 'Investment' }, 10000, now).label, 'Research first');
});
test('verified priority is explicit and still sorts remaining listed rates numerically', () => {
  const products = [{ ...account, checkStatus: 'verified' }, { ...account, id: 'higher', rate: 5.1, checkStatus: 'failed' }, { ...account, id: 'lower', rate: 4.8, termsChanged: true }];
  assert.deepEqual(selectProducts(products, { amount: 10000, sort: 'verified' }, now).map(product => product.id), ['test', 'higher', 'lower']);
});
test('ISA subscription limits are not treated as maximum balances', () => {
  const isa = { ...account, category: 'Cash ISAs', maximum: null, annualContributionLimit: 20000 };
  assert.equal(assessment(isa, 30000, now).label, 'Worth comparing');
  assert.equal(estimateInterest(isa, 30000), 1350);
});
test('catalogue includes a broader choice and the requested familiar names', () => {
  assert.equal(catalogue.filter(product => product.category === 'Savings').length, 18);
  assert.equal(catalogue.filter(product => product.category === 'Cash ISAs').length, 13);
  assert.equal(new Set(catalogue.map(product => product.id)).size, catalogue.length);
  assert.ok(catalogue.some(product => product.provider === 'Tesco Bank' && product.category === 'Savings'));
  assert.ok(catalogue.some(product => product.provider === 'Trading 212' && product.category === 'Cash ISAs'));
});
test('short bonuses use the follow-on rate rather than promising a full year at headline AER', () => {
  const interest = estimateInterest({ ...account, rate: 5, bonusMonths: 6, baseRate: 2.5 }, 10000);
  assert.ok(interest > 370 && interest < 380);
  assert.equal(estimateInterest(account, 20000), 900);
  assert.equal(estimateInterest(account, NaN), null);
});
test('switching comparisons only use verified unrestricted eligible savings, and compare pounds', () => {
  const products = [{ ...account, checkStatus: 'verified' }, { ...account, rate: 9, checkStatus: 'failed' }, { ...account, rate: 8, checkStatus: 'verified', maximum: 3000 }, { ...account, rate: 6, checkStatus: 'verified', access: 'Fixed term' }];
  const comparison = switchingComparison(products, 10000, 3, now);
  assert.equal(comparison.interest, 450);
  assert.equal(comparison.closingBalance, 10450);
  assert.equal(comparison.gain, 150);
  assert.equal(switchingComparison(products, 10000, 5, now).gain, -50);
  assert.equal(switchingComparison(products, 10000, null, now).gain, null);
});