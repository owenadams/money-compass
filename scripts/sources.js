import { load } from 'cheerio';
import { createHash } from 'node:crypto';

const normalise = text => text.replace(/\s+/g, ' ').trim();

export function extractRate(html, adapter) {
  const dom = load(html);
  dom('script, style, noscript, svg').remove();
  let candidates = [];
  if (adapter === 'cynergy') {
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

export function pageFingerprint(html) {
  const dom = load(html);
  dom('script, style, noscript, svg, header, footer, nav, aside, [role="navigation"], [id*="cookie"], [class*="cookie"]').remove();
  const text = normalise(dom('main').length ? dom('main').text() : dom('body').text());
  if (text.length < 100) throw new Error('Source content too short');
  return createHash('sha256').update(text).digest('hex');
}

export function applyCheck(product, result, checkedAt) {
  if (result.error) return { ...product, lastAttemptAt: checkedAt, checkStatus: 'failed', checkMessage: result.error };
  const termsChanged = Boolean(product.termsChanged || (product.sourceFingerprint && product.sourceFingerprint !== result.fingerprint));
  return { ...product, lastAttemptAt: checkedAt, sourceCheckedAt: checkedAt, sourceFingerprint: result.fingerprint, termsChanged, checkStatus: result.rate === undefined ? 'manual' : 'verified', checkMessage: result.rate === undefined ? 'Source reachable; rate and terms still require manual review.' : 'Rate read from a product-specific section; terms remain separately dated.', ...(result.rate === undefined ? {} : { rate: result.rate, rateCheckedAt: checkedAt }) };
}