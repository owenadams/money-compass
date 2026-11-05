export const categories = ['Savings', 'Cash ISAs', 'Current accounts', 'Credit cards', 'Stocks & shares ISAs', 'Funds & ETFs', 'Individual shares', 'Premium Bonds', 'Lifetime ISAs'];

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

export function estimateSavingsTax(gross, profile = {}) {
  if (!Number.isFinite(gross) || gross < 0 || !profile.enabled) return null;
  const bands = { basic: [0.2, 1000], higher: [0.4, 500], additional: [0.45, 0], low: [0.2, 1000] };
  const band = bands[profile.band];
  if (!band || profile.otherInterest === '' || profile.otherInterest == null) return null;
  const otherInterest = Number(profile.otherInterest);
  if (!Number.isFinite(otherInterest) || otherInterest < 0) return null;
  let allowance = band[1];
  if (profile.band === 'low') {
    if (profile.income === '' || profile.income == null) return null;
    const income = Number(profile.income);
    if (!Number.isFinite(income) || income < 0 || income >= 17570 || income + otherInterest + gross > 50270) return null;
    allowance += Math.max(0, 12570 - income) + Math.max(0, 5000 - Math.max(0, income - 12570));
  }
  const remainingAllowance = Math.max(0, allowance - otherInterest);
  const tax = Math.max(0, gross - remainingAllowance) * band[0];
  return { tax, net: gross - tax, remainingAllowance };
}

export function estimateCashReturn(product, amount, profile = {}, funding = 'new') {
  const gross = estimateInterest(product, amount);
  if (!['Savings', 'Cash ISAs'].includes(product.category) || gross === null) return { gross, tax: null, net: null, reason: 'No eligible cash-interest estimate.' };
  if (product.category === 'Cash ISAs') {
    if (funding === 'transfer' && product.acceptsTransfers !== true) return { gross, tax: null, net: null, reason: 'ISA transfer eligibility needs checking.' };
    if (funding !== 'transfer') {
      const used = profile.isaUsed === '' || profile.isaUsed == null ? null : Number(profile.isaUsed);
      if (used !== null && (!Number.isFinite(used) || used < 0 || used > 20000)) return { gross, tax: null, net: null, reason: 'Enter valid ISA subscriptions for 2026/27.' };
      if (amount > 20000 - (used ?? 0)) return { gross, tax: null, net: null, reason: 'New money exceeds your remaining 2026/27 ISA allowance. No whole-balance estimate; compare a smaller amount or an eligible ISA transfer.' };
      if (profile.enabled && used === null) return { gross, tax: null, net: null, reason: 'Enter ISA subscriptions already made this tax year (0 if none).' };
    }
    return { gross, tax: 0, net: gross, reason: 'Tax-free interest, subject to ISA eligibility and funding rules.' };
  }
  const estimate = estimateSavingsTax(gross, profile);
  return estimate ? { gross, ...estimate, reason: 'Illustrative tax at your selected savings tax band; shared allowances reduced by other interest.' }
    : { gross, tax: null, net: null, reason: profile.enabled ? 'Complete the tax assumptions; low-income estimates outside the supported range are unavailable.' : 'Before tax · your tax position is unknown.' };
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
    && (!filters.unlimitedAccess || product.access === 'Easy access' || product.access === 'Everyday access')
    && (!filters.cardPurpose || product.category !== 'Credit cards' || product.creditCard?.purposes.includes(filters.cardPurpose));
}

export function selectProducts(products, filters, now = new Date()) {
  return products.filter(product => (!filters.category || product.category === filters.category || filters.category === 'Savings & cash ISAs' && ['Savings', 'Cash ISAs'].includes(product.category))
    && (!filters.access || product.access === filters.access)
    && (!filters.savedOnly || filters.saved.includes(product.id))
    && matchesEligibility(product, filters)
    && (!filters.search || `${product.provider} ${product.name} ${product.category}`.toLowerCase().includes(filters.search.toLowerCase())))
    .map(product => productForFunding(product, filters.funding))
    .sort((first, second) => {
      if (filters.sort === 'name') return first.provider.localeCompare(second.provider);
      if (filters.sort === 'after-tax') {
        const net = product => estimateCashReturn(product, filters.amount, filters.taxProfile, filters.funding).net ?? -Infinity;
        return net(second) - net(first) || first.provider.localeCompare(second.provider);
      }
      if (filters.category === 'Current accounts') {
        const value = product => estimateCurrentAccount(product, filters.currentAccountInputs || { balance: filters.amount ?? 0, monthlySpend: 0, monthlyBills: 0, monthlyPayIn: 0, directDebitCount: 0, cardTransactions: 0, linkedSavingsBalance: 0 })?.netValue ?? -Infinity;
        return value(second) - value(first) || first.provider.localeCompare(second.provider);
      }
      if (filters.category === 'Credit cards') {
        if (filters.sort === 'credit-apr') return (first.creditCard?.representativeApr ?? Infinity) - (second.creditCard?.representativeApr ?? Infinity) || first.provider.localeCompare(second.provider);
        if (filters.sort === 'credit-promo') return (second.creditCard?.purchaseMonths ?? second.creditCard?.balanceTransferMonths ?? 0) - (first.creditCard?.purchaseMonths ?? first.creditCard?.balanceTransferMonths ?? 0) || first.provider.localeCompare(second.provider);
        return first.provider.localeCompare(second.provider);
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
  const interestEligible = (terms.balanceAER ?? 0) > 0 && balance > 0
    && monthlyPayIn >= (terms.interestRequiresMonthlyPayIn ?? 0)
    && directDebitCount >= (terms.interestRequiresDirectDebits ?? 0);
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
  const monthlyFeeCharged = terms.feeWaivedAtPayIn !== undefined && monthlyPayIn >= terms.feeWaivedAtPayIn ? 0 : terms.monthlyFee ?? 0;
  const fee = monthlyFeeCharged * 12;
  const netValue = interest + linkedSavingsInterest + cashback - fee;
  return { eligible: true, interest, linkedSavingsInterest, cashback, monthlyFeeCharged, fee, netValue, oneOffSwitchBonus: terms.oneOffSwitchBonus ?? null, switchBonusEligibility: terms.switchBonusEligibility ?? '', interestEligible, linkedSavingsEligible, qualifiedBenefit: interestEligible || cashback > 0 || linkedSavingsEligible, switchBonusNote: terms.switchBonusNote ?? '' };
}

export function estimateCreditCard(product, inputs) {
  const terms = product.creditCard;
  if (!terms || product.category !== 'Credit cards') return null;
  const monthlySpend = Number(inputs.monthlySpend);
  const transferAmount = Number(inputs.transferAmount);
  const plannedPurchase = Number(inputs.plannedPurchase);
  if (![monthlySpend, transferAmount, plannedPurchase].every(Number.isFinite)
    || monthlySpend < 0 || transferAmount < 0 || plannedPurchase < 0) return null;
  const balanceTransferFee = transferAmount * (terms.balanceTransferFeePercent ?? 0) / 100;
  const balanceTransferMonthlyTarget = terms.balanceTransferMonths ? (transferAmount + balanceTransferFee) / terms.balanceTransferMonths : null;
  const purchaseMonthlyTarget = terms.purchaseMonths ? plannedPurchase / terms.purchaseMonths : null;
  const firstYearSpend = monthlySpend * 12;
  const introSpend = Math.min(firstYearSpend, terms.rewardSpendCap ?? Infinity);
  let rewards = introSpend * (terms.rewardRate ?? 0) / 100;
  if (terms.followOnRewardRate && firstYearSpend > introSpend) rewards += (firstYearSpend - introSpend) * terms.followOnRewardRate / 100;
  if (terms.rewardCap !== undefined) rewards = Math.min(rewards, terms.rewardCap);
  if (terms.annualReward && monthlySpend >= (terms.minimumMonthlySpend ?? 0)) rewards = Math.max(rewards, terms.annualReward);
  const firstYearFee = terms.firstYearFee ?? terms.annualFee ?? 0;
  return { balanceTransferFee, balanceTransferMonthlyTarget, purchaseMonthlyTarget, estimatedFirstYearRewards: rewards, firstYearFee, estimatedRewardValueAfterFee: rewards - firstYearFee, purchasePromotionMonths: terms.purchaseMonths ?? 0, transferPromotionMonths: terms.balanceTransferMonths ?? 0, representativeApr: terms.representativeApr ?? null, postPromotionApr: terms.postPromotionApr ?? terms.representativeApr ?? null };
}