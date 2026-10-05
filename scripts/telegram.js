export function updateMessage(market, { pageUrl, runUrl, deployed = true, localTest = false } = {}) {
  const run = market.history[0];
  const title = localTest ? 'Money Compass: local test (not published yet)' : deployed ? 'Money Compass: weekly checks published' : 'Money Compass: update or publication failed';
  const lines = [title];
  if (run) {
    lines.push(`Checked: ${new Date(run.checkedAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`, `${run.rateChecks} rates verified; ${run.failures} checks failed; ${run.manualChecks} need manual review.`);
    lines.push(run.changes.length ? `${run.changes.length} rate change(s):\n${run.changes.slice(0, 8).map(change => `${change.provider} ${change.name}: ${change.before}% -> ${change.after}%`).join('\n')}` : 'No rate changes found in successfully checked products.');
  } else lines.push('No completed rate check is available.');
  lines.push('Reviews and unparsed rates are dated snapshots, not refreshed recommendations. Verify terms before applying.');
  if (deployed && !localTest && pageUrl) lines.push(pageUrl);
  if (runUrl) lines.push(`Run details: ${runUrl}`);
  return lines.join('\n\n').slice(0, 4000);
}

export async function sendTelegram({ token, chatId, text, fetchImpl = fetch }) {
  if (!token || !chatId) throw new Error('Telegram configuration is missing. Set the bot token and chat ID privately.');
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(30000)
    });
  } catch { throw new Error('Telegram request failed. Check connectivity and private bot configuration.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(`Telegram rejected the message (HTTP ${response.status}). Check the private configuration.`);
  return true;
}