import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationDecision, sendTelegram, updateMessage } from '../scripts/telegram.js';

const market = { history: [{ checkedAt: '2026-10-05T08:00:00Z', rateChecks: 5, failures: 2, manualChecks: 17, changes: [] }] };
const now = new Date('2026-10-05T12:00:00Z');
const savings = { provider: 'Example Bank', name: 'Easy saver', category: 'Savings', rateKind: 'AER', rate: 4.5, access: 'Easy access', minimum: 1, maximum: null, bonusMonths: 12, checkStatus: 'verified', rateCheckedAt: '2026-10-05' };
test('notification distinguishes successful checks, failures and manual reviews', () => {
  const message = updateMessage(market, { pageUrl: 'https://example.com/app/' });
  assert.match(message, /5 rates verified; 2 checks failed; 17 need manual review/);
  assert.match(message, /https:\/\/example.com\/app\//);
  assert.match(updateMessage(market, { deployed: false }), /publication failed/);
  assert.match(updateMessage(market, { localTest: true }), /local test \(not published yet\)/);
});
test('Telegram sends the same plain-text bot format as calendar-digest', async () => {
  await sendTelegram({ token: 'test-token', chatId: '123', text: 'Test', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.telegram.org/bottest-token/sendMessage');
    assert.deepEqual(JSON.parse(options.body), { chat_id: '123', text: 'Test', link_preview_options: { is_disabled: true } });
    return { ok: true, json: async () => ({ ok: true }) };
  } });
});
test('Telegram errors never expose the token or upstream response body', async () => {
  await assert.rejects(sendTelegram({ token: 'private-token', chatId: '123', text: 'Test', fetchImpl: async () => { throw new Error('https://api.telegram.org/botprivate-token'); } }), error => !error.message.includes('private-token'));
  await assert.rejects(sendTelegram({ token: 'private-token', chatId: '123', text: 'Test', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ description: 'private-token' }) }) }), error => !error.message.includes('private-token'));
});
test('summary includes actual rates, pound returns and conditional switching guidance', () => {
  const message = updateMessage({ ...market, products: [savings] }, { now });
  assert.match(message, /4\.50% AER/);
  assert.match(message, /£450 interest/);
  assert.match(message, /If your current unrestricted savings earns below 4\.50% AER/);
  assert.match(message, /not your linked account balance/);
});
test('failed or stale high rates cannot become a switching recommendation', () => {
  const message = updateMessage({ ...market, products: [savings, { ...savings, provider: 'Failed Bank', rate: 9, checkStatus: 'failed' }, { ...savings, provider: 'Old Bank', rate: 10, rateCheckedAt: '2026-09-01' }] }, { now });
  assert.match(message, /NOT newly verified/);
  assert.match(message, /compare Example Bank/);
  assert.doesNotMatch(message, /compare Failed Bank|compare Old Bank/);
});
test('known benchmark can report no gain, and failed publication suppresses switching guidance', () => {
  const data = { ...market, products: [savings] };
  assert.match(updateMessage(data, { now, currentRate: 5 }), /No higher verified unrestricted savings return/);
  assert.match(updateMessage(data, { now, currentRate: 3 }), /£150 a year/);
  assert.match(updateMessage(data, { now, deployed: false }), /Switching guidance unavailable/);
});
test('limited balance offers explain their cap instead of quoting interest on the full example balance', () => {
  const message = updateMessage({ ...market, products: [{ ...savings, maximum: 3000 }] }, { now });
  assert.match(message, /maximum £3,000; the whole example balance does not fit/);
  assert.doesNotMatch(message, /£450 interest/);
});
test('unchanged weeks are quiet and a verified £50 improvement triggers an alert', () => {
  const run = { ...market.history[0], previousCheckedAt: '2026-10-05', previousVerifiedOffers: [savings], verifiedOffers: [savings], newWarnings: [] };
  assert.equal(notificationDecision({ history: [run] }).send, false);
  assert.equal(notificationDecision({ history: [{ ...run, verifiedOffers: [{ ...savings, rate: 4.9 }] }] }).send, false);
  const improved = notificationDecision({ history: [{ ...run, verifiedOffers: [{ ...savings, rate: 5 }] }] });
  assert.equal(improved.send, true);
  assert.equal(improved.improvements[0].gain, 50);
  const delivered = { history: [{ ...run, verifiedOffers: [{ ...savings, rate: 5 }] }], alertState: { sentSignatures: [improved.improvements[0].signature] } };
  assert.equal(notificationDecision(delivered).send, false);
  assert.equal(notificationDecision({ history: [{ ...run, previousVerifiedOffers: [{ ...savings, rate: 4.55 }], verifiedOffers: [{ ...savings, rate: 5.05 }] }] }).send, true);
  assert.equal(notificationDecision({ history: [run] }, { weeklySummary: true }).send, true);
});
test('stale rates and repeated failures do not produce improvement alerts; new warnings and deployment failures do', () => {
  const run = { ...market.history[0], previousCheckedAt: '2026-10-05', previousVerifiedOffers: [savings], verifiedOffers: [{ ...savings, rate: 9, checkStatus: 'failed' }], newWarnings: [] };
  assert.equal(notificationDecision({ history: [run] }).send, false);
  assert.equal(notificationDecision({ history: [{ ...run, newWarnings: [{ provider: 'Example Bank' }] }] }).send, true);
  assert.equal(notificationDecision({ history: [run] }, { deployed: false }).send, true);
  assert.throws(() => notificationDecision({ history: [run] }, { minimumGain: NaN }));
});