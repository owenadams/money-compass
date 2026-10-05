import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCheck, extractRate, pageFingerprint } from '../scripts/sources.js';

test('new product-specific adapters ignore unrelated gross and promotional rates', () => {
  assert.equal(extractRate('<h1>Easy Access Autumn Account (Issue 1): 4.30% AER</h1><p>Other rate 9%</p>', 'oxbury'), 4.3);
  assert.equal(extractRate('<h1>1 Year Fixed Rate Cash ISA</h1><div class="product-page__rate-card-col">4.94% Fixed/Tax-Free AER</div><div class="product-page__rate-card-col">Gross 4.83% monthly</div>', 'shawbrook-isa'), 4.94);
  assert.equal(extractRate('<h1>CASH ISA</h1><h2>4.60% AER (VARIABLE)*</h2><p>Old rate 3.5%</p>', 'plum-isa'), 4.6);
});
test('new adapters fail closed on changed products or ambiguous rates', () => {
  assert.throws(() => extractRate('<h1>2 Year Fixed Rate Cash ISA</h1><div class="product-page__rate-card-col">4.94% Fixed/Tax-Free AER</div>', 'shawbrook-isa'));
  assert.throws(() => extractRate('<h1>CASH ISA</h1><h2>4.60% AER (VARIABLE)</h2><h2>5.00% AER (VARIABLE)</h2>', 'plum-isa'));
  assert.throws(() => extractRate('<h1>Fixed Bond: 5% AER</h1>', 'oxbury'));
});
test('verified headline rate-only changes do not hide genuine opportunities, but term changes still block them', () => {
  const original = `<main><h1>Easy Access Autumn Account (Issue 1): 4.30% AER</h1><p>${'Unlimited withdrawals. No introductory bonus. '.repeat(4)}</p><p>Other account 2.5% AER</p></main>`;
  const updated = original.replace('4.30%', '4.90%');
  const product = { sourceFingerprint: pageFingerprint(original), rateIndependentFingerprint: pageFingerprint(original, 4.3) };
  assert.equal(applyCheck(product, { rate: 4.9, fingerprint: pageFingerprint(updated), rateIndependentFingerprint: pageFingerprint(updated, 4.9) }, '2026-10-05').termsChanged, false);
  const changedTerms = updated.replace('Unlimited withdrawals.', 'Only three withdrawals.');
  assert.equal(applyCheck(product, { rate: 4.9, fingerprint: pageFingerprint(changedTerms), rateIndependentFingerprint: pageFingerprint(changedTerms, 4.9) }, '2026-10-05').termsChanged, true);
  const changedBonus = updated.replace('2.5%', '2.0%');
  assert.notEqual(pageFingerprint(changedBonus, 4.9), product.rateIndependentFingerprint);
});