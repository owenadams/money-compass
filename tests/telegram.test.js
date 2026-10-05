import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegram, updateMessage } from '../scripts/telegram.js';

const market = { history: [{ checkedAt: '2026-10-05T08:00:00Z', rateChecks: 5, failures: 2, manualChecks: 17, changes: [] }] };
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