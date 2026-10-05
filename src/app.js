import './app.css';
import { createIcons, Compass, ArrowUpRight, Bookmark, Search, ShieldCheck, Clock3, CircleHelp, ChevronDown, Wallet, TrendingUp, RefreshCw, Check, Bell } from 'lucide';
import { initialMarket } from './catalogue.js';
import { categories, assessment, estimateInterest, isStale, selectProducts } from './finance.js';

const iconSet = { Compass, ArrowUpRight, Bookmark, Search, ShieldCheck, Clock3, CircleHelp, ChevronDown, Wallet, TrendingUp, RefreshCw, Check, Bell };
const app = document.querySelector('#app');
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const icon = name => `<i data-lucide="${name.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}" aria-hidden="true"></i>`;
const date = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not run yet';
const external = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}${icon('ArrowUpRight')}</a>`;
let market = initialMarket;
let dataWarning = '';
let saved = [];
let amount = 10000;
let toastTimer;
try {
  const storedSaved = JSON.parse(localStorage.getItem('money-compass-saved') || '[]');
  saved = Array.isArray(storedSaved) ? storedSaved.filter(value => typeof value === 'string') : [];
  const storedAmount = Number(localStorage.getItem('money-compass-amount'));
  if (storedAmount > 0 && storedAmount <= 10000000 && Number.isFinite(storedAmount)) amount = storedAmount;
} catch { dataWarning = 'Device storage is unavailable. Your shortlist will not persist.'; }
let view = 'compare';
const filters = { category: 'Savings', access: '', search: '', sort: 'rate' };
const refreshIcons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.7 } });

function sourceStatus(product) {
  if (product.termsChanged) return 'Source changed: review terms';
  if (product.checkStatus === 'failed') return 'Latest check failed';
  if (product.rate !== null && isStale(product.rateCheckedAt)) return 'Rate snapshot is out of date';
  return product.checkStatus === 'verified' ? 'Rate checked automatically' : 'Manual review required';
}

function productRow(product) {
  const verdict = assessment(product, amount);
  const estimated = estimateInterest(product, amount);
  const current = !isStale(product.rateCheckedAt) && product.checkStatus !== 'failed' && !product.termsChanged;
  const isSaved = saved.includes(product.id);
  const domain = new URL(product.sourceUrl).hostname;
  const metric = product.rate === null ? (product.risk === 'Investment' ? 'Market-linked' : 'Check rate') : `${product.rate.toFixed(2)}%`;
  return `<article class="product-row" data-product="${escape(product.id)}"><div class="product-overview">
    <div class="provider"><div class="provider-logo"><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128" alt="" loading="lazy" referrerpolicy="no-referrer" /><span>${escape(product.provider.slice(0, 2))}</span></div><div><h3>${escape(product.provider)}</h3><p>${escape(product.name)}</p><span class="source-status ${current ? '' : 'warning-text'}">${escape(sourceStatus(product))}</span></div></div>
    <div class="rate"><strong>${escape(metric)}</strong><span>${product.rateKind === 'AER' ? 'AER · ' + (product.access === 'Fixed term' ? 'fixed' : 'variable') : product.rateKind === 'Prize fund' ? 'Prize fund · not your return' : 'No guaranteed return'}</span></div>
    <div class="access"><span class="access-label">${icon(product.risk === 'Investment' ? 'TrendingUp' : 'Clock3')}${escape(product.access)}</span><small>${product.risk === 'Investment' ? 'Capital at risk' : `${money(product.minimum)} min · ${product.maximum === null ? 'max: check terms' : `${money(product.maximum)} max`}`}</small></div>
    <div class="verdict"><span class="badge ${verdict.tone}">${escape(verdict.label)}</span><small>${current && estimated !== null ? `${money(estimated)} interest illustration / year` : 'Read conditions below'}</small></div>
    <button class="icon-button save-button ${isSaved ? 'saved' : ''}" data-save="${escape(product.id)}" aria-label="${isSaved ? 'Remove' : 'Save'} ${escape(product.provider)} ${escape(product.name)}" aria-pressed="${isSaved}" title="${isSaved ? 'Remove from shortlist' : 'Save to shortlist'}">${icon(isSaved ? 'Check' : 'Bookmark')}</button>
  </div><details><summary>Details & provider review ${icon('ChevronDown')}</summary><div class="product-details">
    <section><h4>Access & conditions</h4><p>${escape(product.terms)}</p>${product.annualContributionLimit ? `<p class="fine-print">2026/27 contribution limit: ${money(product.annualContributionLimit)}${product.category === 'Lifetime ISAs' ? ', within the overall ISA allowance' : ' shared across ISA types'}. This is not a maximum account balance. Check eligibility and current rules.</p>` : ''}<p class="detail-label">Protection</p><p>${escape(product.protection)}</p>${external(product.sourceUrl, 'Provider & current terms')}${external('https://www.fscs.org.uk/check/check-your-money-is-protected/', 'Check protection')}</section>
    <section><h4>Provider review</h4><p>${escape(product.summary)}</p><p class="review-date">Money Compass summary · reviewed ${date(product.termsReviewedAt)}${product.termsChanged ? ' · source changed since review' : ''}</p>${external(product.reviewUrl, 'Find current customer reviews')}${external(product.editorialUrl, 'Independent guide / official rules')}<p class="fine-print">Customer scores are not verified here. Reviews can be biased and do not establish financial safety. A guide link is not a product endorsement.</p></section>
    <section><h4>Our assessment</h4><p>${escape(verdict.reason)}</p><p class="detail-label">Fees</p><p>${escape(product.fees)}</p><p class="review-date">${product.rate === null ? 'Terms' : 'Rate'} snapshot: ${date(product.rate === null ? product.termsReviewedAt : product.rateCheckedAt)}<br>Latest source attempt: ${date(product.lastAttemptAt)}<br>${escape(product.checkMessage || 'Initial sourced snapshot; verify before applying.')}</p>${estimated !== null && current ? `<p class="fine-print">Illustration assumes ${money(amount)} stays deposited for a year, AER stays unchanged and all conditions are met. Before tax; not a promise.</p>` : ''}</section>
  </div></details></article>`;
}

function comparisonPage() {
  const shortlist = view === 'shortlist';
  return `<div class="section-heading"><div><p class="eyebrow">${shortlist ? 'YOUR RESEARCH' : 'UK MONEY OPTIONS'}</p><h1>${shortlist ? 'Your shortlist' : 'Find a place for your money'}</h1><p>${shortlist ? 'Saved on this device. Compare the conditions before choosing.' : 'Compare the rate. Know the rules. Check the provider.'}</p></div><label class="amount-field">Comparison balance <div><span>£</span><input id="amount" type="number" min="1" max="10000000" step="1" value="${amount}" aria-label="Comparison balance in pounds" /></div></label></div>
  ${shortlist ? '' : `<div class="money-paths"><div>${icon('Wallet')}<div><h2>Within reach</h2><p>Cash for unexpected bills and shorter-term plans.</p></div><span>Access comes first</span></div><div>${icon('TrendingUp')}<div><h2>Room to grow</h2><p>Investments for money you can leave for 5+ years.</p></div><span>Returns are not guaranteed</span></div></div>`}
  <div class="category-tabs" role="tablist" aria-label="Money categories">${(shortlist ? ['All saved', ...categories] : categories).map(category => `<button role="tab" data-category="${escape(category)}" aria-selected="${filters.category === category}" class="${filters.category === category ? 'active' : ''}">${escape(category)}</button>`).join('')}</div>
  <div class="filter-bar"><label class="search-field">${icon('Search')}<input id="search" type="search" placeholder="Search a provider or account" value="${escape(filters.search)}" aria-label="Search providers and accounts" /></label><label>Access<select id="access"><option value="">All access types</option>${['Easy access', 'Limited access', 'Notice', 'Fixed term', 'Sell investments', 'Restricted purpose'].map(access => `<option ${filters.access === access ? 'selected' : ''}>${escape(access)}</option>`).join('')}</select></label><label>Sort by<select id="sort"><option value="rate" ${filters.sort === 'rate' ? 'selected' : ''}>Current eligible AER</option><option value="name" ${filters.sort === 'name' ? 'selected' : ''}>Provider A–Z</option></select></label></div>
  <div class="comparison-intro"><span id="result-count"></span><span>Selected options, not the whole market ${icon('CircleHelp')}</span></div>
  <div class="table-labels"><span>PROVIDER / ACCOUNT</span><span>RATE / RETURN</span><span>GETTING YOUR MONEY</span><span>ASSESSMENT</span><span></span></div><div id="results"></div>
  <div class="source-note">${icon('ShieldCheck')}<p>Cash and investments are different. FSCS deposit protection is up to £120,000 per eligible person, per authorised institution, not per account. It does not cover investment market losses. ${external('https://www.fscs.org.uk/what-we-cover/', 'FSCS rules')}</p></div>`;
}

function updatesPage() {
  return `<div class="section-heading"><div><p class="eyebrow">WEEKLY CHECK-IN</p><h1>Updates & sources</h1><p>What was checked, what changed, and what still needs review.</p></div></div>
  <div class="update-summary"><div>${icon('RefreshCw')}<h2>Monday provider checks</h2><p>Scheduled for 08:00 UTC via GitHub Actions. GitHub may delay scheduled runs; the dated log below records actual checks.</p></div><div>${icon('Bell')}<h2>Telegram updates</h2><p>The GitHub workflow sends a check-in after publication, including verified rates, failed checks and manual reviews. Bot credentials stay in private repository secrets.</p></div></div>
  <p class="notice">Automated rates: Cynergy, Cahoot, NS&I Direct Saver, NS&I Direct ISA and Premium Bonds. Other rates, investment fees and provider reviews are dated snapshots requiring manual review. A reachable page does not mean its rate was updated.</p>
  <div class="update-log">${market.history.length ? market.history.map(run => `<section><div><h3>${date(run.checkedAt)}</h3><span>${run.rateChecks} rates checked · ${run.failures} failed · ${run.manualChecks} manual</span></div>${run.changes.length ? `<ul>${run.changes.map(change => `<li>${escape(change.provider)} / ${escape(change.name)}: ${change.before}% → ${change.after}%</li>`).join('')}</ul>` : '<p>No rate changes detected in successfully parsed products.</p>'}</section>`).join('') : '<p>No automated checks have run yet.</p>'}</div>
  <h2 class="subheading">Source status</h2><div class="source-list">${market.products.map(product => `<div><span><strong>${escape(product.provider)}</strong> · ${escape(product.name)}</span><span>${escape(sourceStatus(product))}</span>${external(product.sourceUrl, 'Source')}</div>`).join('')}</div>`;
}

function guidePage() {
  const entries = [
    ['Start with the essentials', 'Before investing, consider expensive debt and an emergency fund covering several months of essential bills. There is no one-size-fits-all split between cash and investments.', 'https://www.moneyhelper.org.uk/en/savings/types-of-savings/emergency-savings-how-much-is-enough'],
    ['Easy access is not always instant', 'Easy access means no notice period, not necessarily same-day payment. Limited-access accounts may cut the rate after a number of withdrawals. Notice accounts require advance warning; fixed savings usually lock money away.', 'https://www.moneysavingexpert.com/savings/savings-accounts-best-interest/'],
    ['An ISA is a tax wrapper', 'Cash ISAs hold savings; stocks & shares ISAs hold investments. They share an annual contribution allowance. The published allowance is £20,000 for 2026/27; tax rules can change. Use the receiving provider’s ISA transfer process to keep the wrapper.', 'https://www.gov.uk/individual-savings-accounts'],
    ['AER makes savings rates comparable', 'Annual Equivalent Rate illustrates interest over a year including compounding. Check bonuses, deposit caps, withdrawal rules and tax. An investment return or Premium Bonds prize fund rate is not an AER savings promise.', 'https://www.moneyhelper.org.uk/en/savings/types-of-savings'],
    ['Investing needs time and accepts losses', 'A broad fund spreads money across companies; an individual share concentrates risk. Five years is a starting horizon, not a guarantee. Platform fees, fund costs, dealing charges, FX and spreads can all reduce returns.', 'https://www.fca.org.uk/investsmart'],
    ['Lifetime ISAs have strings attached', 'Usually open aged 18–39. Contribute up to £4,000 each year within your overall ISA allowance, with a 25% government bonus. Qualifying first-home purchase or withdrawals from 60 avoid the normal 25% charge. A £4,000 contribution plus £1,000 bonus becomes £3,750 after that charge: £250 less than you put in.', 'https://www.gov.uk/lifetime-isa'],
    ['Our labels are not personal advice', '“Worth comparing” means a current, eligible easy-access option to research, not a claim that it is the safest provider or the best account in the UK. Other labels explain access limitations, stale checks and investment risks. Reviews here are our dated feature summaries, with links to independent guides and unverified customer reviews.', 'https://register.fca.org.uk/']
  ];
  return `<div class="section-heading"><div><p class="eyebrow">THE PLAIN-ENGLISH VERSION</p><h1>A little more clarity</h1><p>The distinctions that matter before moving your money.</p></div></div><div class="guide-list">${entries.map(([title, text, link], index) => `<section><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${escape(title)}</h2><p>${escape(text)}</p>${external(link, 'Read the source')}</div></section>`).join('')}</div>`;
}

function renderResults() {
  const results = document.querySelector('#results');
  if (!results) return;
  const products = selectProducts(market.products, { ...filters, category: filters.category === 'All saved' ? '' : filters.category, amount, saved, savedOnly: view === 'shortlist' });
  document.querySelector('#result-count').textContent = `${products.length} ${products.length === 1 ? 'option' : 'options'} · ${money(amount)} comparison`;
  results.innerHTML = products.length ? products.map(productRow).join('') : `<div class="empty-state">${icon('Bookmark')}<h2>${view === 'shortlist' ? 'No saved matches' : 'No matching options'}</h2><p>${view === 'shortlist' ? 'Save an option from Compare to add it here, or change your filters.' : 'Try a different category, access type or provider name.'}</p><button data-clear class="secondary-button">Clear filters</button></div>`;
  refreshIcons();
}

function render() {
  const lastRun = market.history[0];
  app.innerHTML = `<header><div class="header-inner"><a class="brand" href="#compare" aria-label="Money Compass home"><span>${icon('Compass')}</span>Money Compass<span class="uk-label">UK</span></a><nav aria-label="Main navigation">${[['compare', 'Compare', 'Wallet'], ['shortlist', `Shortlist (${saved.length})`, 'Bookmark'], ['updates', 'Updates', 'RefreshCw'], ['guide', 'Guide', 'CircleHelp']].map(([key, label, symbol]) => `<button data-view="${key}" class="${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${escape(label)}</span></button>`).join('')}</nav></div></header>
  <div class="status-band"><div><span class="status-dot"></span>${lastRun ? `Last attempt ${date(market.lastAttemptAt)} · ${lastRun.rateChecks} rates checked${lastRun.failures ? ` · ${lastRun.failures} failed` : ''}` : 'Initial sourced snapshots · automatic checks not run'}<a href="#updates">View update log ${icon('ArrowUpRight')}</a></div></div>
  <main>${dataWarning ? `<p class="notice" role="status">${escape(dataWarning)}</p>` : ''}${view === 'updates' ? updatesPage() : view === 'guide' ? guidePage() : comparisonPage()}</main>
  <footer><div><strong>Money Compass</strong><p>Information, not personalised financial advice. Rates and terms can change. Verify with the provider before applying. Investments can lose value.</p><span>No account connections. No personal balances published. Shortlist stays on this device.</span></div>${external('https://www.moneyhelper.org.uk/', 'Free, impartial money guidance')}</footer><div id="toast" role="status" aria-live="polite"></div>`;
  renderResults();
  refreshIcons();
}

function setView(next) {
  if (!['compare', 'shortlist', 'updates', 'guide'].includes(next)) next = 'compare';
  if (view !== next) { filters.search = ''; filters.access = ''; filters.category = next === 'shortlist' ? 'All saved' : 'Savings'; }
  view = next;
  render();
}

function persist() {
  try { localStorage.setItem('money-compass-saved', JSON.stringify(saved)); localStorage.setItem('money-compass-amount', String(amount)); }
  catch { dataWarning = 'Device storage is unavailable. Changes will not persist after closing.'; }
}
app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) { location.hash = button.dataset.view; return; }
  if (button.dataset.category) { filters.category = button.dataset.category; filters.access = ''; render(); return; }
  if (button.hasAttribute('data-clear')) { filters.search = ''; filters.access = ''; render(); return; }
  if (button.dataset.save) {
    const id = button.dataset.save;
    saved = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id];
    persist();
    const openIds = [...document.querySelectorAll('details[open]')].map(detail => detail.closest('[data-product]').dataset.product);
    renderResults();
    for (const productId of openIds) { const detail = document.querySelector(`[data-product="${productId}"] details`); if (detail) detail.open = true; }
    document.querySelector('[data-view="shortlist"] span').textContent = `Shortlist (${saved.length})`;
    const toast = document.querySelector('#toast');
    toast.textContent = dataWarning || (saved.includes(id) ? 'Saved to your device shortlist' : 'Removed from shortlist');
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }
});
app.addEventListener('error', event => { if (event.target instanceof HTMLImageElement) event.target.hidden = true; }, true);
app.addEventListener('input', event => { if (event.target.id === 'search') { filters.search = event.target.value; renderResults(); } });
app.addEventListener('change', event => {
  if (event.target.id === 'access') filters.access = event.target.value;
  if (event.target.id === 'sort') filters.sort = event.target.value;
  if (event.target.id === 'amount') {
    if (!event.target.checkValidity() || !Number.isFinite(event.target.valueAsNumber)) { event.target.reportValidity(); return; }
    amount = event.target.valueAsNumber;
    persist();
  }
  renderResults();
});
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
setView(location.hash.slice(1));

async function loadMarket() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/market.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Data unavailable');
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.products) || !Array.isArray(data.history)) throw new Error('Invalid dataset');
    market = data;
  } catch { dataWarning = 'Latest data could not be loaded. Showing bundled, dated snapshots; verify current rates directly.'; }
  render();
}
loadMarket();