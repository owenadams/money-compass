import test from 'node:test';
import assert from 'node:assert/strict';
import { assessment, estimateInterest, estimateCurrentAccount, isStale, selectProducts, switchingComparison, productForFunding } from '../src/finance.js';
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
test('eligibility filters exclude unknowns, required apps and accounts, and unsupported ISA transfers', () => {
  const filters = { amount: 10000, sort: 'rate', noApp: true, noOtherAccount: true };
  const products = [{ ...account, appRequired: false, requiresAnotherAccount: false }, { ...account, id: 'app', appRequired: true }, { ...account, id: 'unknown', appRequired: null }];
  assert.deepEqual(selectProducts(products, filters, now).map(product => product.id), ['test']);
  const transfers = selectProducts(catalogue, { amount: 10000, funding: 'transfer' }, now);
  assert.ok(transfers.length > 0);
  assert.ok(transfers.every(product => product.category === 'Cash ISAs' && product.acceptsTransfers === true));
  assert.ok(!transfers.some(product => product.id === 'hodge-fixed-isa'));
});
test('transfer-specific rates replace newbie rates without inheriting automatic verification', () => {
  const product = { ...account, category: 'Cash ISAs', acceptsTransfers: true, transferRate: 3.6, termsReviewedAt: '2026-10-05', checkStatus: 'verified' };
  const transfer = productForFunding(product, 'transfer');
  assert.equal(transfer.rate, 3.6);
  assert.equal(transfer.checkStatus, 'manual');
  assert.equal(estimateInterest(transfer, 10000), 360);
  assert.equal(productForFunding(product, 'new'), product);
  assert.equal(estimateInterest(productForFunding({ ...product, acceptsTransfers: false }, 'transfer'), 10000), null);
  assert.equal(estimateInterest(productForFunding({ ...product, acceptsTransfers: null }, 'transfer'), 10000), null);
});
test('current account annual estimate combines capped interest, qualifying rewards and fees', () => {
  const flexDirect = { category: 'Current accounts', currentAccount: { balanceAER: 5, balanceBonusMonths: 12, balanceCap: 1500, monthlyFee: 0, minimumMonthlyPayIn: 1500, cashbackPrograms: [{ rate: 1, spendSource: 'spend', monthlySpendCap: 500, monthlyCashbackCap: 5, minimumPayIn: 1500 }, { fixedMonthlyCashback: 5, spendSource: 'bills', minimumSpend: 300, minimumDirectDebits: 2, minimumPayIn: 1500 }], oneOffSwitchBonus: 175 } };
  const estimate = estimateCurrentAccount(flexDirect, { balance: 2000, monthlySpend: 500, monthlyBills: 300, monthlyPayIn: 1500, directDebitCount: 2, cardTransactions: 0, linkedSavingsBalance: 0 });
  assert.deepEqual(estimate, { eligible: true, interest: 75, linkedSavingsInterest: 0, cashback: 120, fee: 0, netValue: 195, oneOffSwitchBonus: 175, interestEligible: true, linkedSavingsEligible: false, qualifiedBenefit: true, switchBonusNote: '' });
});
test('current account reward estimate subtracts fees and checks every stated requirement', () => {
  const edge = { category: 'Current accounts', currentAccount: { balanceAER: 0, balanceBonusMonths: 0, monthlyFee: 3, minimumMonthlyPayIn: 500, cashbackPrograms: [{ rate: 1, spendSource: 'bills', monthlySpendCap: Infinity, monthlyCashbackCap: 10, minimumDirectDebits: 2, minimumPayIn: 500 }] } };
  const qualified = estimateCurrentAccount(edge, { balance: 500, monthlySpend: 0, monthlyBills: 1000, monthlyPayIn: 500, directDebitCount: 2, cardTransactions: 0, linkedSavingsBalance: 0 });
  assert.equal(qualified.cashback, 120);
  assert.equal(qualified.fee, 36);
  assert.equal(qualified.netValue, 84);
  const notQualified = estimateCurrentAccount(edge, { balance: 500, monthlySpend: 0, monthlyBills: 1000, monthlyPayIn: 0, directDebitCount: 0, cardTransactions: 0, linkedSavingsBalance: 0 });
  assert.equal(notQualified.cashback, 0);
  assert.equal(notQualified.netValue, -36);
  assert.equal(notQualified.interestEligible, false);
  assert.equal(notQualified.qualifiedBenefit, false);
});
test('current account model includes eligible linked-saver interest and ranks by estimated annual value', () => {
  const chase = catalogue.find(product => product.id === 'chase-current');
  const input = { balance: 0, monthlySpend: 500, monthlyBills: 0, monthlyPayIn: 0, directDebitCount: 0, cardTransactions: 15, linkedSavingsBalance: 2000 };
  const estimate = estimateCurrentAccount(chase, input);
  assert.equal(estimate.cashback, 120);
  assert.equal(estimate.linkedSavingsInterest, 90);
  assert.equal(estimate.netValue, 210);
  const products = [chase, { ...chase, id: 'fee-account', currentAccount: { balanceAER: 0, monthlyFee: 30, cashbackPrograms: [] } }];
  assert.deepEqual(selectProducts(products, { category: 'Current accounts', sort: 'current-value', amount: 0, currentAccountInputs: input }).map(product => product.id), ['chase-current', 'fee-account']);
});
test('current account catalogue is distinct from AER products and discloses fees, bonuses and requirements', () => {
  const accounts = catalogue.filter(product => product.category === 'Current accounts');
  assert.equal(accounts.length, 4);
  assert.ok(accounts.every(product => product.rate === null && product.rateKind === 'Current account rewards' && product.currentAccount));
  assert.equal(catalogue.find(product => product.id === 'nationwide-flexdirect').currentAccount.oneOffSwitchBonus, 175);
  assert.equal(catalogue.find(product => product.id === 'santander-edge').currentAccount.monthlyFee, 3);
  assert.equal(catalogue.find(product => product.id === 'chase-current').currentAccount.cashbackPrograms[0].minimumCardTransactions, 15);
  assert.ok(selectProducts(accounts, { category: 'Current accounts', unlimitedAccess: true, amount: 0 }).length > 0);
  const edge = catalogue.find(product => product.id === 'santander-edge');
  const notEnoughBills = estimateCurrentAccount(edge, { balance: 0, monthlySpend: 0, monthlyBills: 500, monthlyPayIn: 500, directDebitCount: 1, cardTransactions: 0, linkedSavingsBalance: 4000 });
  assert.equal(notEnoughBills.linkedSavingsEligible, false);
  assert.equal(notEnoughBills.linkedSavingsInterest, 0);
});