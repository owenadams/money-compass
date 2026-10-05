export const categories = ['Savings', 'Cash ISAs', 'Stocks & shares ISAs', 'Funds & ETFs', 'Individual shares', 'Premium Bonds', 'Lifetime ISAs'];

export function isStale(date, now = new Date()) {
  const age = now.getTime() - new Date(date).getTime();
  return !Number.isFinite(age) || age < -86400000 || age > 8 * 86400000;
}

export function estimateInterest(product, amount) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(product.rate) || product.rateKind !== 'AER' || amount < product.minimum || (product.maximum !== null && amount > product.maximum)) return null;
  if (product.bonusMonths < 12) {
    if (!Number.isFinite(product.baseRate) || product.baseRate < 0 || product.bonusMonths < 0) return null;
    const bonusYears = product.bonusMonths / 12;
    return amount * ((1 + product.rate / 100) ** bonusYears * (1 + product.baseRate / 100) ** (1 - bonusYears) - 1);
  }
  return amount * product.rate / 100;
}

export function switchingComparison(products, amount, currentRate, now = new Date(), category = 'Savings') {
  const candidates = products.filter(product => product.category === category && product.access === 'Easy access' && product.checkStatus === 'verified' && !product.termsChanged && !isStale(product.rateCheckedAt, now))
    .map(product => ({ product, interest: estimateInterest(product, amount) }))
    .filter(candidate => candidate.interest !== null)
    .sort((first, second) => second.interest - first.interest);
  if (!candidates.length) return null;
  const best = candidates[0];
  const baseline = Number.isFinite(currentRate) && currentRate >= 0 && currentRate <= 100 ? amount * currentRate / 100 : null;
  return { ...best, closingBalance: amount + best.interest, effectiveRate: best.interest / amount * 100, gain: baseline === null ? null : best.interest - baseline };
}

export function assessment(product, amount, now = new Date()) {
  if (product.risk === 'Investment') return { label: 'Research first', tone: 'caution', reason: 'Capital can fall in value. Not suitable for an emergency fund; allow at least five years.' };
  if (product.category === 'Lifetime ISAs') return { label: 'Only for specific goals', tone: 'caution', reason: 'Eligibility and withdrawal charges matter. Not a quick-access savings account.' };
  if (product.rateKind === 'Prize fund') return { label: 'Not guaranteed income', tone: 'caution', reason: 'The prize fund rate is not your return. You could win nothing.' };
  if (isStale(product.rateCheckedAt, now) || product.checkStatus === 'failed' || product.termsChanged) return { label: 'Needs checking', tone: 'caution', reason: 'The rate or terms need verification before this can be shortlisted.' };
  if (amount < product.minimum || (product.maximum !== null && amount > product.maximum)) return { label: 'Outside deposit range', tone: 'muted', reason: 'Your comparison amount is outside the published balance limits.' };
  if (product.access !== 'Easy access') return { label: 'Not for emergency money', tone: 'caution', reason: 'Notice, withdrawal limits or a fixed term make this unsuitable for frequent access.' };
  return { label: 'Worth comparing', tone: 'positive', reason: 'An easy-access option to compare, subject to eligibility and the provider’s current terms. Not a personal recommendation.' };
}

export function productForFunding(product, funding) {
  if (funding !== 'transfer' || product.category !== 'Cash ISAs') return product;
  if (product.acceptsTransfers !== true) return { ...product, rate: null, checkStatus: 'manual', checkMessage: product.acceptsTransfers === false ? 'This account does not accept ISA transfers.' : 'ISA transfer eligibility is unknown; check provider terms.' };
  if (!Number.isFinite(product.transferRate)) return product;
  return { ...product, rate: product.transferRate, checkStatus: 'manual', rateCheckedAt: product.termsReviewedAt, checkMessage: 'ISA transfer rate from dated terms; not automatically verified.', name: `${product.name} (ISA transfer rate)` };
}

export function matchesEligibility(product, filters) {
  return (!filters.customer || product.customerEligibility === filters.customer)
    && (!filters.noApp || product.appRequired === false)
    && (!filters.noOtherAccount || product.requiresAnotherAccount === false)
    && (!filters.funding || filters.funding !== 'transfer' || product.category === 'Cash ISAs' && product.acceptsTransfers === true)
    && (!filters.unlimitedAccess || product.access === 'Easy access');
}

export function selectProducts(products, filters, now = new Date()) {
  return products.filter(product => (!filters.category || product.category === filters.category)
    && (!filters.access || product.access === filters.access)
    && (!filters.savedOnly || filters.saved.includes(product.id))
    && matchesEligibility(product, filters)
    && (!filters.search || `${product.provider} ${product.name} ${product.category}`.toLowerCase().includes(filters.search.toLowerCase())))
    .map(product => productForFunding(product, filters.funding))
    .sort((first, second) => {
      if (filters.sort === 'name') return first.provider.localeCompare(second.provider);
      const eligible = product => Number.isFinite(product.rate) && product.rateKind === 'AER' && filters.amount >= product.minimum && (product.maximum === null || filters.amount <= product.maximum);
      const verified = product => eligible(product) && product.checkStatus === 'verified' && !isStale(product.rateCheckedAt, now) && !product.termsChanged;
      if (filters.sort === 'verified' && verified(first) !== verified(second)) return Number(verified(second)) - Number(verified(first));
      if (eligible(first) !== eligible(second)) return Number(eligible(second)) - Number(eligible(first));
      return (Number.isFinite(second.rate) ? second.rate : -1) - (Number.isFinite(first.rate) ? first.rate : -1) || first.provider.localeCompare(second.provider);
    });
}