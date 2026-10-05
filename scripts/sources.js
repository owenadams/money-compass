import { load } from 'cheerio';
import { createHash } from 'node:crypto';

const normalise = text => text.replace(/\s+/g, ' ').trim();

export function extractRate(html, adapter) {
  const dom = load(html);
  dom('script, style, noscript, svg').remove();
  let candidates = [];
  if (adapter === 'oxbury') {
    candidates = dom('h1').map((index, element) => normalise(dom(element).text()).match(/^Easy Access Autumn Account \(Issue \d+\):\s*(\d+(?:\.\d+)?)%\s*AER/i)?.[1]).get();
  } else if (adapter === 'shawbrook-isa') {
    if (!/^1 Year Fixed Rate Cash ISA$/i.test(normalise(dom('h1').text()))) throw new Error('Unexpected product heading');
    candidates = dom('.product-page__rate-card-col').map((index, element) => normalise(dom(element).text()).match(/^(\d+(?:\.\d+)?)%\s*Fixed\/Tax-Free AER$/i)?.[1]).get();
  } else if (adapter === 'plum-isa') {
    if (!/^CASH ISA$/i.test(normalise(dom('h1').text()))) throw new Error('Unexpected product heading');
    candidates = dom('h2').map((index, element) => normalise(dom(element).text()).match(/^(\d+(?:\.\d+)?)%\s*AER \(VARIABLE\)\*?$/i)?.[1]).get();
  } else if (adapter === 'cynergy') {
    candidates = dom('h1').map((index, element) => normalise(dom(element).text()).match(/^Online Easy Access Account\s+(\d+(?:\.\d+)?)%\s+AER/i)?.[1]).get();
  } else if (adapter === 'cahoot') {
    candidates = dom('p').map((index, element) => normalise(dom(element).text()).match(/^Enjoy\s+(\d+(?:\.\d+)?)%\s+AER\/gross.*12 months.*3,000/i)?.[1]).get();
  } else if (adapter === 'nsandi-prize') {
    const text = normalise(dom('main').length ? dom('main').text() : dom('body').text());
    candidates = [...text.matchAll(/What['\u2019]s the annual prize fund rate\?\s*(\d+(?:\.\d+)?)%,\s*variable/gi)].map(match => match[1]);
  } else if (adapter === 'nsandi-aer') {
    const text = normalise(dom('main').length ? dom('main').text() : dom('body').text());
    candidates = [...text.matchAll(/(?:What's the interest rate\?|Interest rate)\s*(\d+(?:\.\d+)?)%\s*(?:tax-free|gross)\/AER,?\s*variable/gi)].map(match => match[1]);
  } else {
    throw new Error('No rate adapter: manual review required');
  }
  const unique = [...new Set(candidates.map(Number))];
  if (unique.length !== 1 || !Number.isFinite(unique[0]) || unique[0] <= 0 || unique[0] > 15) throw new Error('Missing or ambiguous product rate');
  return unique[0];
}

export function pageFingerprint(html, verifiedRate = null) {
  const dom = load(html);
  dom('script, style, noscript, svg, header, footer, nav, aside, [role="navigation"], [id*="cookie"], [class*="cookie"]').remove();
  let text = normalise(dom('main').length ? dom('main').text() : dom('body').text());
  if (text.length < 100) throw new Error('Source content too short');
  if (Number.isFinite(verifiedRate)) text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, value) => Number(value) === verifiedRate ? '[verified-product-rate]' : match);
  return createHash('sha256').update(text).digest('hex');
}

export function applyCheck(product, result, checkedAt) {
  if (result.error) return { ...product, lastAttemptAt: checkedAt, checkStatus: 'failed', checkMessage: result.error };
  const changed = product.rateIndependentFingerprint && result.rateIndependentFingerprint ? product.rateIndependentFingerprint !== result.rateIndependentFingerprint : product.sourceFingerprint && product.sourceFingerprint !== result.fingerprint;
  const termsChanged = Boolean(product.termsChanged || changed);
  return { ...product, lastAttemptAt: checkedAt, sourceCheckedAt: checkedAt, sourceFingerprint: result.fingerprint, rateIndependentFingerprint: result.rateIndependentFingerprint, termsChanged, checkStatus: result.rate === undefined ? 'manual' : 'verified', checkMessage: result.rate === undefined ? 'Source reachable; rate and terms still require manual review.' : 'Rate read from a product-specific section; terms remain separately dated.', ...(result.rate === undefined ? {} : { rate: result.rate, rateCheckedAt: checkedAt }) };
}