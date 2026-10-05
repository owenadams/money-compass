import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalogue, initialMarket } from '../src/catalogue.js';
import { applyCheck, extractRate, pageFingerprint } from './sources.js';

const file = new URL('../public/data/market.json', import.meta.url);
let previous;
try { previous = JSON.parse(await readFile(file, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; previous = initialMarket; }
const checkedAt = new Date().toISOString();
const changes = [];
const sourceCache = new Map();
let rateChecks = 0;
let failures = 0;

async function fetchSource(url) {
  if (!sourceCache.has(url)) sourceCache.set(url, (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'MoneyCompass/1.0 public-product-checker' } });
    if (!response.ok) throw new Error(`Source unavailable (HTTP ${response.status})`);
    return response.text();
  })());
  return sourceCache.get(url);
}

const products = [];
for (const definition of catalogue) {
  const saved = previous.products.find(item => item.id === definition.id);
  const product = saved && saved.termsReviewedAt === definition.termsReviewedAt ? { ...definition, ...saved, maximum: definition.maximum, annualContributionLimit: definition.annualContributionLimit } : definition;
  try {
    const html = await fetchSource(product.sourceUrl);
    const fingerprint = pageFingerprint(html);
    const rate = product.adapter ? extractRate(html, product.adapter) : undefined;
    const updated = applyCheck(product, { rate, fingerprint }, checkedAt);
    if (rate !== undefined) rateChecks++;
    if (rate !== undefined && product.rate !== rate) changes.push({ id: product.id, provider: product.provider, name: product.name, before: product.rate, after: rate });
    products.push(updated);
    console.log(`${product.id}: ${updated.checkStatus}${rate === undefined ? '' : ` (${rate}%)`}${updated.termsChanged ? ' - terms need review' : ''}`);
  } catch (error) {
    failures++;
    products.push(applyCheck(product, { error: error.message }, checkedAt));
    console.log(`${product.id}: check failed; previous data retained`);
  }
}
const run = { checkedAt, rateChecks, failures, manualChecks: products.length - rateChecks - failures, changes };
const market = { ...previous, schemaVersion: 1, lastAttemptAt: checkedAt, lastSuccessfulRateCheckAt: rateChecks ? checkedAt : previous.lastSuccessfulRateCheckAt, products, history: [run, ...previous.history].slice(0, 12) };
await mkdir(fileURLToPath(new URL('../public/data/', import.meta.url)), { recursive: true });
await writeFile(file, `${JSON.stringify(market, null, 2)}\n`);
console.log(`Completed: ${rateChecks} rate checks, ${failures} failures, ${run.manualChecks} manual reviews. No review date was automatically refreshed.`);