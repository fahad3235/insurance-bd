// Insurance BD - pure logic (no DOM). Node-testable and browser-safe.
// All money is in Bangladeshi Taka (integer). Dates are YYYY-MM-DD strings.
'use strict';

const POLICY_TYPES = ['Life', 'Health', 'Motor', 'Property', 'Travel', 'Education'];

const FREQUENCIES = ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'];
const FREQ_MONTHS = { Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Yearly: 12 };

const CLAIM_STATUSES = ['Filed', 'Approved', 'Rejected', 'Paid'];
const POLICY_STATUSES = ['Active', 'Lapsed', 'Matured', 'Claimed'];

const MIN_SUM_ASSURED = 10000;
const MAX_SUM_ASSURED = 100000000;
const MIN_PREMIUM = 100;
const MAX_PREMIUM = 10000000;
const MAX_NAME = 60;
const MAX_INSURER = 60;
const MAX_POLICY_NO = 30;
const DUE_SOON_DAYS = 30;

// Sample policies shipped with the app. They are EXAMPLES only - the UI and
// README label them as such; the user enters their real policy details.
const SAMPLE_POLICIES = [
  {
    insurer: 'Example Life Insurance Ltd.',
    type: 'Life',
    policyNo: 'EX-LIFE-1001',
    holder: 'Rahim Uddin',
    sumAssured: 1000000,
    premium: 2500,
    frequency: 'Monthly',
    startDate: '2025-01-15',
    nextDue: '2026-11-15',
    maturityDate: '2045-01-15',
    nominee: 'Fatema Begum',
    phone: '01712345678',
    status: 'Active',
    sample: true,
  },
  {
    insurer: 'Example General Insurance Ltd.',
    type: 'Motor',
    policyNo: 'EX-MOTOR-2002',
    holder: 'Rahim Uddin',
    sumAssured: 500000,
    premium: 12000,
    frequency: 'Yearly',
    startDate: '2026-02-01',
    nextDue: '2027-02-01',
    maturityDate: '2027-02-01',
    nominee: 'Karim Uddin',
    phone: '',
    status: 'Active',
    sample: true,
  },
];

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function todayISO(now) {
  const d = now ? new Date(now) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function validDateISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
}

function validMobile(s) {
  return typeof s === 'string' && /^01[3-9]\d{8}$/.test(s);
}

function validPolicyNo(s) {
  return typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{2,29}$/.test(s.trim());
}

// Add months to a YYYY-MM-DD date, clamping the day to the target month
// (e.g. 2026-01-31 + 1 month -> 2026-02-28).
function addMonths(dateStr, months) {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1] - 1 + months;
  const d = parts[2];
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return (
    targetYear +
    '-' +
    String(targetMonth + 1).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0')
  );
}

// Whole days from `from` to `date` (negative when date is in the past).
function daysUntil(dateStr, fromStr) {
  const a = new Date(fromStr + 'T00:00:00');
  const b = new Date(dateStr + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function nextDueAfter(frequency, fromDate) {
  const months = FREQ_MONTHS[frequency];
  if (!months) return null;
  return addMonths(fromDate, months);
}

// Premium payable per year for a policy.
function annualPremium(policy) {
  const months = FREQ_MONTHS[policy.frequency];
  if (!months) return 0;
  return policy.premium * (12 / months);
}

// Due state of a policy on a given day.
// 'matured' wins over due states: a matured policy needs no premium.
function dueState(policy, today) {
  if (policy.status === 'Matured' || (policy.maturityDate && policy.maturityDate < today)) {
    return 'matured';
  }
  if (policy.status === 'Lapsed' || policy.status === 'Claimed') {
    return 'closed';
  }
  const diff = daysUntil(policy.nextDue, today);
  if (diff < 0) return 'overdue';
  if (diff <= DUE_SOON_DAYS) return 'due-soon';
  return 'ok';
}

function validatePolicy(p, existing) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['invalid'];
  if (typeof p.insurer !== 'string' || p.insurer.trim().length < 2 || p.insurer.trim().length > MAX_INSURER) errs.push('insurer');
  if (POLICY_TYPES.indexOf(p.type) === -1) errs.push('type');
  if (!validPolicyNo(p.policyNo)) errs.push('policyNo');
  if (typeof p.holder !== 'string' || p.holder.trim().length < 2 || p.holder.trim().length > MAX_NAME) errs.push('holder');
  if (!isInt(p.sumAssured) || p.sumAssured < MIN_SUM_ASSURED || p.sumAssured > MAX_SUM_ASSURED) errs.push('sumAssured');
  if (!isInt(p.premium) || p.premium < MIN_PREMIUM || p.premium > MAX_PREMIUM) errs.push('premium');
  if (FREQUENCIES.indexOf(p.frequency) === -1) errs.push('frequency');
  if (!validDateISO(p.startDate)) errs.push('startDate');
  if (!validDateISO(p.nextDue)) errs.push('nextDue');
  if (!validDateISO(p.maturityDate)) errs.push('maturityDate');
  if (validDateISO(p.startDate) && validDateISO(p.maturityDate) && p.maturityDate < p.startDate) errs.push('maturityBeforeStart');
  if (typeof p.nominee !== 'string' || p.nominee.trim().length < 2 || p.nominee.trim().length > MAX_NAME) errs.push('nominee');
  if (p.phone !== undefined && p.phone !== '' && !validMobile(p.phone)) errs.push('phone');
  if (POLICY_STATUSES.indexOf(p.status) === -1) errs.push('status');
  if (validPolicyNo(p.policyNo) && Array.isArray(existing)) {
    const dup = existing.some(
      (e) => e.id !== p.id && String(e.policyNo).toLowerCase() === String(p.policyNo).trim().toLowerCase()
    );
    if (dup) errs.push('duplicatePolicyNo');
  }
  return errs;
}

function validatePayment(amount, dateStr) {
  const errs = [];
  if (!isInt(amount) || amount < 1 || amount > MAX_PREMIUM * 12) errs.push('amount');
  if (!validDateISO(dateStr)) errs.push('date');
  return errs;
}

function validateClaim(c, policyIds) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['invalid'];
  if (policyIds.indexOf(c.policyId) === -1) errs.push('policyId');
  if (!isInt(c.amount) || c.amount < 1 || c.amount > MAX_SUM_ASSURED) errs.push('amount');
  if (!validDateISO(c.date)) errs.push('date');
  if (CLAIM_STATUSES.indexOf(c.status) === -1) errs.push('status');
  return errs;
}

// A policy may be deleted only while it has no payments or claims logged.
function canDeletePolicy(policyId, payments, claims) {
  const hasPayment = (payments || []).some((x) => x.policyId === policyId);
  const hasClaim = (claims || []).some((x) => x.policyId === policyId);
  return !hasPayment && !hasClaim;
}

// Dashboard totals. `today` is a YYYY-MM-DD string.
function dashboardTotals(policies, payments, today) {
  const active = policies.filter((p) => p.status === 'Active');
  let sumAssured = 0;
  let dueThisMonth = 0;
  let overdue = 0;
  for (const p of active) {
    sumAssured += p.sumAssured;
    if (p.nextDue.slice(0, 7) === today.slice(0, 7)) dueThisMonth++;
    if (dueState(p, today) === 'overdue') overdue++;
  }
  let paidTotal = 0;
  for (const pay of payments || []) paidTotal += pay.amount;
  return {
    sumAssured,
    activeCount: active.length,
    totalPolicies: policies.length,
    dueThisMonth,
    overdue,
    paidTotal,
  };
}

function filterPolicies(policies, opts) {
  const q = (opts.q || '').trim().toLowerCase();
  const type = opts.type || 'All';
  const status = opts.status || 'All';
  return policies.filter((p) => {
    if (type !== 'All' && p.type !== type) return false;
    if (status !== 'All' && p.status !== status) return false;
    if (!q) return true;
    return [p.insurer, p.policyNo, p.holder, p.nominee, p.type]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

// Policies sorted by next due date, soonest first (overdue on top).
function sortByDue(policies) {
  return policies.slice().sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0));
}

function validateImport(data) {
  const errs = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['notObject'];
  if (!Array.isArray(data.policies)) return ['policiesMissing'];
  if (data.payments !== undefined && !Array.isArray(data.payments)) return ['paymentsMissing'];
  if (data.claims !== undefined && !Array.isArray(data.claims)) return ['claimsMissing'];
  const seen = new Set();
  for (const p of data.policies) {
    const pe = validatePolicy(p, data.policies.filter((x) => x !== p));
    if (pe.length) errs.push('policy:' + (p.policyNo || '?') + ':' + pe.join(','));
    const key = String(p.policyNo || '').toLowerCase();
    if (seen.has(key)) errs.push('duplicatePolicyNo:' + p.policyNo);
    seen.add(key);
  }
  const ids = new Set(data.policies.map((p) => p.id));
  for (const pay of data.payments || []) {
    if (!ids.has(pay.policyId)) errs.push('payment:unknownPolicy:' + pay.policyId);
    if (validatePayment(pay.amount, pay.date).length) errs.push('payment:invalid:' + pay.policyId);
  }
  for (const c of data.claims || []) {
    if (validateClaim(c, Array.from(ids)).length) errs.push('claim:invalid:' + (c.policyId || '?'));
  }
  return errs;
}

function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
function toBnDigits(s) {
  return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

function formatNum(n, lang) {
  const s = Number(n).toLocaleString('en-US');
  return lang === 'bn' ? toBnDigits(s) : s;
}

function formatTaka(n, lang) {
  return '৳' + formatNum(n, lang);
}

const EXPORTS = {
  POLICY_TYPES,
  FREQUENCIES,
  FREQ_MONTHS,
  CLAIM_STATUSES,
  POLICY_STATUSES,
  MIN_SUM_ASSURED,
  MAX_SUM_ASSURED,
  MIN_PREMIUM,
  MAX_PREMIUM,
  DUE_SOON_DAYS,
  SAMPLE_POLICIES,
  isInt,
  round2,
  todayISO,
  validDateISO,
  validMobile,
  validPolicyNo,
  addMonths,
  daysUntil,
  nextDueAfter,
  annualPremium,
  dueState,
  validatePolicy,
  validatePayment,
  validateClaim,
  canDeletePolicy,
  dashboardTotals,
  filterPolicies,
  sortByDue,
  validateImport,
  newId,
  toBnDigits,
  formatNum,
  formatTaka,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EXPORTS;
}
if (typeof window !== 'undefined') {
  window.InsuranceLogic = EXPORTS;
}
