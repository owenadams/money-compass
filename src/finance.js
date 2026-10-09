export const categories = ['Savings', 'Cash ISAs', 'Current accounts', 'Stocks & shares ISAs', 'Funds & ETFs', 'Individual shares', 'Premium Bonds', 'Lifetime ISAs'];

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
    && (!filters.unlimitedAccess || product.access === 'Easy access' || product.access === 'Everyday access');
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
      if (filters.category === 'Current accounts') {
        const value = product => estimateCurrentAccount(product, filters.currentAccountInputs || { balance: filters.amount ?? 0, monthlySpend: 0, monthlyBills: 0, monthlyPayIn: 0, directDebitCount: 0, cardTransactions: 0, linkedSavingsBalance: 0 })?.netValue ?? -Infinity;
        return value(second) - value(first) || first.provider.localeCompare(second.provider);
      }
      const eligible = product => Number.isFinite(product.rate) && product.rateKind === 'AER' && filters.amount >= product.minimum && (product.maximum === null || filters.amount <= product.maximum);
      const verified = product => eligible(product) && product.checkStatus === 'verified' && !isStale(product.rateCheckedAt, now) && !product.termsChanged;
      if (filters.sort === 'verified' && verified(first) !== verified(second)) return Number(verified(second)) - Number(verified(first));
      if (eligible(first) !== eligible(second)) return Number(eligible(second)) - Number(eligible(first));
      return (Number.isFinite(second.rate) ? second.rate : -1) - (Number.isFinite(first.rate) ? first.rate : -1) || first.provider.localeCompare(second.provider);
    });
}

export function estimateCurrentAccount(product, inputs) {
  const terms = product.currentAccount;
  if (!terms || product.category !== 'Current accounts') return null;
  const balance = Number(inputs.balance);
  const monthlySpend = Number(inputs.monthlySpend);
  const monthlyBills = Number(inputs.monthlyBills);
  const monthlyPayIn = Number(inputs.monthlyPayIn);
  const directDebitCount = Number(inputs.directDebitCount);
  const cardTransactions = Number(inputs.cardTransactions);
  const linkedSavingsBalance = Number(inputs.linkedSavingsBalance);
  const rewardChoice = inputs.rewardChoice || 'bills';
  if (![balance, monthlySpend, monthlyBills, monthlyPayIn, directDebitCount, cardTransactions, linkedSavingsBalance].every(Number.isFinite)
    || balance < 0 || monthlySpend < 0 || monthlyBills < 0 || monthlyPayIn < 0 || directDebitCount < 0 || cardTransactions < 0 || linkedSavingsBalance < 0) return null;

  const interestBalance = Math.min(balance, terms.balanceInterestCap ?? terms.balanceCap ?? balance);
  const introMonths = Math.min(12, terms.balanceBonusMonths ?? 0);
  const baseRate = terms.balanceBaseAER ?? 0;
  const interestEligible = (terms.balanceAER ?? 0) > 0 && balance > 0 && monthlyPayIn >= (terms.interestRequiresMonthlyPayIn ?? 0);
  const interest = interestEligible ? interestBalance * ((terms.balanceAER ?? 0) * introMonths / 1200 + baseRate * (12 - introMonths) / 1200) : 0;
  const cashback = terms.cashbackPrograms.reduce((total, program) => {
    if (program.choice && program.choice !== rewardChoice) return total;
    const spend = program.spendSource === 'bills' ? monthlyBills : monthlySpend;
    if (spend < (program.minimumSpend ?? 0)
      || directDebitCount < (program.minimumDirectDebits ?? 0)
      || cardTransactions < (program.minimumCardTransactions ?? 0)
      || monthlyPayIn < (program.minimumPayIn ?? terms.minimumMonthlyPayIn ?? 0)
      || linkedSavingsBalance < (program.minimumLinkedSavings ?? 0)) return total;
    const eligibleSpend = Math.min(spend, program.monthlySpendCap ?? Infinity);
    const monthlyReward = program.fixedMonthlyCashback ?? Math.min(eligibleSpend * program.rate / 100, program.monthlyCashbackCap ?? Infinity);
    return total + monthlyReward * 12;
  }, 0);
  const linkedSavings = terms.linkedSavings;
  const linkedSavingsEligible = Boolean(linkedSavings
    && linkedSavingsBalance >= (linkedSavings.minimumBalance ?? 0)
    && monthlyPayIn >= (linkedSavings.minimumMonthlyPayIn ?? 0)
    && directDebitCount >= (linkedSavings.minimumDirectDebits ?? 0));
  const linkedBalance = linkedSavingsEligible ? Math.min(linkedSavingsBalance, linkedSavings.maximum ?? linkedSavingsBalance) : 0;
  const linkedIntroMonths = linkedSavingsEligible ? Math.min(12, linkedSavings.bonusMonths ?? 0) : 0;
  const linkedSavingsInterest = linkedBalance * ((linkedSavingsEligible ? linkedSavings.rate ?? 0 : 0) * linkedIntroMonths / 1200 + (linkedSavingsEligible ? linkedSavings.baseRate ?? 0 : 0) * (12 - linkedIntroMonths) / 1200);
  const fee = (terms.monthlyFee ?? 0) * 12;
  const netValue = interest + linkedSavingsInterest + cashback - fee;
  return { eligible: true, interest, linkedSavingsInterest, cashback, fee, netValue, oneOffSwitchBonus: terms.oneOffSwitchBonus ?? null, interestEligible, linkedSavingsEligible, qualifiedBenefit: interestEligible || cashback > 0 || linkedSavingsEligible, switchBonusNote: terms.switchBonusNote ?? '' };
}