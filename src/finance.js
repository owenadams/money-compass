export const categories = ['Savings', 'Cash ISAs', 'Stocks & shares ISAs', 'Funds & ETFs', 'Individual shares', 'Premium Bonds', 'Lifetime ISAs'];

export function isStale(date, now = new Date()) {
  const age = now.getTime() - new Date(date).getTime();
  return !Number.isFinite(age) || age < -86400000 || age > 8 * 86400000;
}

export function estimateInterest(product, amount) {
  if (!Number.isFinite(product.rate) || product.rateKind !== 'AER' || amount < product.minimum || (product.maximum !== null && amount > product.maximum) || product.bonusMonths < 12) return null;
  return amount * product.rate / 100;
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

export function selectProducts(products, filters, now = new Date()) {
  return products.filter(product => (!filters.category || product.category === filters.category)
    && (!filters.access || product.access === filters.access)
    && (!filters.savedOnly || filters.saved.includes(product.id))
    && (!filters.search || `${product.provider} ${product.name} ${product.category}`.toLowerCase().includes(filters.search.toLowerCase())))
    .sort((first, second) => {
      if (filters.sort === 'name') return first.provider.localeCompare(second.provider);
      const validRate = product => !isStale(product.rateCheckedAt, now) && product.checkStatus !== 'failed' && !product.termsChanged && product.rateKind === 'AER' && filters.amount >= product.minimum && (product.maximum === null || filters.amount <= product.maximum) ? product.rate : -1;
      return validRate(second) - validRate(first) || first.provider.localeCompare(second.provider);
    });
}