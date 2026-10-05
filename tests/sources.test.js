import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCheck, extractRate } from '../scripts/sources.js';

test('extracts only the matching product rate, not another promotional rate', () => {
  assert.equal(extractRate('<h1>Online Easy Access Account 4.55% AER*</h1><p>Other bond 9%</p>', 'cynergy'), 4.55);
  assert.equal(extractRate('<p>Enjoy 5.00% AER/gross (variable) for 12 months, on up to £3,000 in easy access savings</p>', 'cahoot'), 5);
  assert.equal(extractRate('<main>What\'s the annual prize fund rate? 4.35%, variable <p>Annual prize fund rate 3.6%, variable</p><p>Direct ISA 3.8%</p></main>', 'nsandi-prize'), 4.35);
});
test('fails closed when rates disappear or become ambiguous', () => {
  assert.throws(() => extractRate('<h1>Account closed</h1><p>Other product 5%</p>', 'cynergy'));
  assert.throws(() => extractRate('<h1>Online Easy Access Account 4.5% AER</h1><h1>Online Easy Access Account 4.6% AER</h1>', 'cynergy'));
});
test('failures and reachability checks do not refresh rate or review timestamps', () => {
  const product = { rate: 4.5, rateCheckedAt: '2026-10-01', termsReviewedAt: '2026-10-01', sourceFingerprint: 'before' };
  const failed = applyCheck(product, { error: '403' }, '2026-10-05');
  assert.equal(failed.rateCheckedAt, product.rateCheckedAt);
  assert.equal(failed.rate, 4.5);
  const reachable = applyCheck(product, { fingerprint: 'after' }, '2026-10-05');
  assert.equal(reachable.rateCheckedAt, product.rateCheckedAt);
  assert.equal(reachable.termsReviewedAt, product.termsReviewedAt);
  assert.equal(reachable.termsChanged, true);
});
test('verified rates update independently from dated editorial reviews', () => {
  const updated = applyCheck({ rate: 4.5, termsReviewedAt: '2026-10-01' }, { rate: 4.6, fingerprint: 'new' }, '2026-10-05');
  assert.equal(updated.rate, 4.6);
  assert.equal(updated.rateCheckedAt, '2026-10-05');
  assert.equal(updated.termsReviewedAt, '2026-10-01');
});