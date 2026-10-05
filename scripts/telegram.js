import { estimateInterest, isStale, switchingComparison } from '../src/finance.js';

export function notificationDecision(market, { deployed = true, minimumGain = 50, amount = 10000, weeklySummary = false } = {}) {
  if (!Number.isFinite(minimumGain) || minimumGain < 0 || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid notification threshold or comparison amount');
  const run = market.history[0];
  if (!deployed || !run) return { send: true, reason: 'Update or publication failed', improvements: [] };
  const improvements = [];
  for (const category of ['Savings', 'Cash ISAs']) {
    const current = switchingComparison(run.verifiedOffers || market.products || [], amount, null, new Date(run.checkedAt), category);
    const previous = switchingComparison(run.previousVerifiedOffers || [], amount, null, new Date(run.previousCheckedAt || run.checkedAt), category);
    const gain = current && previous ? Math.round((current.interest - previous.interest) * 100) / 100 : 0;
    if (current && previous && gain > 0 && gain >= minimumGain) {
      const signature = `${category}:${current.product.id || current.product.provider}:${current.effectiveRate.toFixed(6)}:${amount}:${minimumGain}`;
      if (!market.alertState?.sentSignatures?.includes(signature)) improvements.push({ category, provider: current.product.provider, name: current.product.name, before: previous.effectiveRate, after: current.effectiveRate, gain, signature });
    }
  }
  if (improvements.length) return { send: true, reason: 'Worthwhile verified improvement', improvements };
  if (run.newWarnings?.length) return { send: true, reason: 'Previously verified offers now need checking', improvements };
  if (!run.previousVerifiedOffers?.length) return { send: true, reason: 'Initial verified comparison baseline', improvements };
  return { send: weeklySummary, reason: weeklySummary ? 'Weekly summary requested' : 'No worthwhile verified improvement; staying quiet', improvements };
}

export function updateMessage(market, { pageUrl, runUrl, deployed = true, localTest = false, amount = 10000, currentRate = null, now = new Date() } = {}) {
  const run = market.history[0];
  const title = localTest ? 'Money Compass: local test (not published yet)' : deployed ? 'Money Compass: weekly checks published' : 'Money Compass: update or publication failed';
  const lines = [title];
  const pounds = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
  if (run) {
    lines.push(`Checked: ${new Date(run.checkedAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`, `${run.rateChecks} rates verified; ${run.failures} checks failed; ${run.manualChecks} need manual review.`);
    lines.push(run.changes.length ? `${run.changes.length} rate change(s):\n${run.changes.slice(0, 8).map(change => `${change.provider} ${change.name}: ${change.before}% -> ${change.after}%`).join('\n')}` : 'No rate changes found in successfully checked products.');
  } else lines.push('No completed rate check is available.');
  const products = market.products || [];
  const cash = products.filter(product => ['Savings', 'Cash ISAs'].includes(product.category) && product.rateKind === 'AER' && Number.isFinite(product.rate));
  const rateLine = product => {
    const interest = estimateInterest(product, amount);
    const unavailable = amount < product.minimum ? `minimum ${pounds(product.minimum)}` : product.maximum !== null && amount > product.maximum ? `maximum ${pounds(product.maximum)}; the whole example balance does not fit` : 'bonus or rate conditions prevent an estimate';
    return `${product.provider} / ${product.name}: ${product.rate.toFixed(2)}% AER; ${product.access}${interest === null ? `; ${unavailable}` : `; about ${pounds(interest)} interest in 1 year${product.bonusMonths < 12 ? ' (bonus-adjusted)' : ''}`}${product.termsChanged ? '; changed terms need review' : ''}`;
  };
  lines.push(`Illustration: ${pounds(amount)} held for one year, before tax, fees and penalties. This is not your linked account balance.`);
  for (const category of ['Savings', 'Cash ISAs']) {
    const verified = cash.filter(product => product.category === category && product.checkStatus === 'verified' && !isStale(product.rateCheckedAt, now)).sort((first, second) => second.rate - first.rate).slice(0, 3);
    if (verified.length) lines.push(`${category} - recently verified rates:\n${verified.map(rateLine).join('\n')}`);
    const listed = cash.filter(product => product.category === category && product.access === 'Easy access' && product.checkStatus !== 'verified' && !isStale(product.rateCheckedAt, now) && estimateInterest(product, amount) !== null).sort((first, second) => second.rate - first.rate).slice(0, 3);
    if (listed.length) lines.push(`${category} - listed offers to verify (NOT newly verified):\n${listed.map(product => `${rateLine(product)}; snapshot ${new Date(product.rateCheckedAt).toLocaleDateString('en-GB')}`).join('\n')}`);
  }
  const comparison = switchingComparison(products, amount, currentRate, now);
  if (!deployed) lines.push('Switching guidance unavailable: publication failed. Do not act on this as a successful refresh.');
  else if (comparison) {
    lines.push(`Worth comparing a move?\n${comparison.gain === null ? `If your current unrestricted savings earns below ${comparison.effectiveRate.toFixed(2)}% AER, compare ${comparison.product.provider} (${comparison.product.rate.toFixed(2)}% listed AER).` : comparison.gain > 0 ? `${comparison.product.provider} could add about ${pounds(comparison.gain)} a year versus your ${currentRate}% AER.` : 'No higher verified unrestricted savings return was found for this balance and current rate.'} Each 1 percentage-point improvement is about ${pounds(amount / 100)} a year. Check eligibility, exit penalties, bonus expiry, tax and shared FSCS protection first. For an ISA, use the provider transfer process, not a manual withdrawal.`);
  } else lines.push('Worth comparing a move? No clean, recently verified unrestricted savings option matches this balance. Check the listed rates and terms before deciding; this update cannot justify a switching recommendation.');
  lines.push('Reviews and unparsed rates are dated snapshots, not refreshed recommendations. Verify terms before applying.');
  if (deployed && !localTest && pageUrl) lines.push(pageUrl);
  if (runUrl) lines.push(`Run details: ${runUrl}`);
  const body = lines.join('\n\n');
  if (body.length <= 4000) return body;
  return `${body.slice(0, 3400)}\n\nSummary shortened. Verify rates and terms before moving money.${deployed && !localTest && pageUrl ? `\n${pageUrl}` : ''}${runUrl ? `\nRun details: ${runUrl}` : ''}`.slice(0, 4000);
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