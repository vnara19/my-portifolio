import { timeWeightedReturns, type TwrObservation } from "./time-weighted-return";
export type DatedCashFlow = { day: string; amount: number };

type CashTerm = { day: number; amount: number };
type XirrResult = { percent: number; status: "unique" } | {
  percent: null;
  status: "insufficient-data" | "no-solution" | "multiple-solutions" | "unresolved";
};

function signChanges(terms: CashTerm[]) {
  return terms.slice(1).filter((term, index) => Math.sign(term.amount) !== Math.sign(terms[index].amount)).length;
}

/** Isolate roots on monotone intervals of an exponential sum. Removing the
 * first exponent leaves the same roots and gives a derivative with one fewer term.
 * With only one sign change, the generalized Descartes rule bounds roots to one.
 */
function cashRoots(terms: CashTerm[]): number[] | null {
  const changes = signChanges(terms);
  if (changes === 0) return [];
  const first = terms[0];
  const last = terms.at(-1)!;
  const dominance = Math.log(2 * terms.length);
  const bound = (edge: CashTerm) => Math.max(1, ...terms.filter(t => t !== edge).map(t =>
    (dominance + Math.log(Math.abs(t.amount)) - Math.log(Math.abs(edge.amount))) / Math.abs(t.day - edge.day)));
  const lo = -bound(first);
  const hi = bound(last);
  const evaluate = (x: number) => {
    const logs = terms.map(t => Math.log(Math.abs(t.amount)) + (t.day - first.day) * x);
    const max = Math.max(...logs);
    let sum = 0;
    let absolute = 0;
    for (const [i, term] of terms.entries()) {
      const weight = Math.exp(logs[i] - max);
      sum += Math.sign(term.amount) * weight;
      absolute += weight;
    }
    return { sum, absolute };
  };
  // Fail closed for unusually complex inputs instead of returning an arbitrary root.
  if (changes > 1 && terms.length > 128) return null;
  const stationary = changes === 1 ? [] : cashRoots(terms.slice(1).map(t => ({
    day: t.day,
    amount: t.amount * (t.day - first.day),
  })));
  if (stationary === null) return null;
  const boundaries = [lo, ...stationary.filter(x => x > lo && x < hi), hi];
  const values = boundaries.map(x => evaluate(x));
  const roots: number[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const { sum, absolute } = values[i];
    if (i > 0 && i < boundaries.length - 1 && Math.abs(sum) <= 32 * Number.EPSILON * absolute) {
      roots.push(boundaries[i]);
      continue;
    }
    if (i === 0 || Math.abs(values[i - 1].sum) <= 32 * Number.EPSILON * values[i - 1].absolute ||
      Math.sign(sum) === Math.sign(values[i - 1].sum)) continue;
    let left = boundaries[i - 1];
    let right = boundaries[i];
    const leftSign = Math.sign(values[i - 1].sum);
    for (let n = 0; n < 140 && right - left > 1e-16; n++) {
      const middle = (left + right) / 2;
      const value = evaluate(middle).sum;
      if (value === 0) { left = right = middle; break; }
      if (Math.sign(value) === leftSign) left = middle;
      else right = middle;
    }
    roots.push((left + right) / 2);
  }
  return roots.sort((a, b) => a - b);
}

export function calculateXirr(flows: DatedCashFlow[]): XirrResult {
  const grouped = new Map<number, number>();
  for (const flow of flows) {
    const day = Date.parse(flow.day) / 86400000;
    if (!Number.isInteger(day) || !Number.isFinite(flow.amount)) return { percent: null, status: "insufficient-data" };
    grouped.set(day, (grouped.get(day) ?? 0) + flow.amount);
  }
  const ordered = [...grouped].filter(([, amount]) => amount !== 0).sort(([a], [b]) => a - b);
  if (ordered.length < 2 || ordered.some(([, amount]) => !Number.isFinite(amount))) return { percent: null, status: "insufficient-data" };
  const scale = Math.max(...ordered.map(([, amount]) => Math.abs(amount)));
  const terms = ordered.map(([day, amount]) => ({ day: (day - ordered[0][0]) / 365, amount: amount / scale }));
  if (terms.some(term => term.amount === 0)) return { percent: null, status: "unresolved" };
  const roots = cashRoots(terms);
  if (roots === null) return { percent: null, status: "unresolved" };
  if (roots.length === 0) return { percent: null, status: "no-solution" };
  if (roots.length > 1) return { percent: null, status: "multiple-solutions" };
  const percent = Math.expm1(-roots[0]) * 100;
  return Number.isFinite(percent) && percent > -100 ? { percent, status: "unique" } : { percent: null, status: "unresolved" };
}

export function xirr(flows: DatedCashFlow[]): number | null {
  return calculateXirr(flows).percent;
}

export function dailyOpenGain(holdings: { units: number; oldUnits: number; currentPrice: number | null; previousPrice: number | null; newUnits: number; newPrincipal: number | null }[]) {
  let amount=0,base=0;
  for(const h of holdings){
    if(h.units<=1e-8)continue;
    const old=Math.max(0,Math.min(h.oldUnits,h.units));
    const bought=Math.max(0,h.units-old);
    if(h.currentPrice===null || (old>0&&h.previousPrice===null) || (bought>0&&(!h.newUnits||h.newPrincipal===null)))return {amount:null,percent:null};
    const principal=bought>0?h.newPrincipal!*bought/h.newUnits:0;
    const start=old*(h.previousPrice??0)+principal;
    amount+=h.units*h.currentPrice-start;base+=start;
  }
  return {amount,percent:base>0?amount/base*100:null};
}

export function overviewPerformanceMetrics(observations:TwrObservation[],asOf:string) {
  const points=observations.filter(p=>p.day<=asOf);
  const last=points.at(-1);
  const twr=timeWeightedReturns(points).at(-1)?.percent??null;
  const flows=points.filter(p=>p.flow!==0).map(p=>({day:p.day,amount:-(p.flow??0)}));
  if(last?.value!==null&&last?.value!==undefined)flows.push({day:last.day,amount:last.value});
  const first = points[0];
  if (first?.value && first.flow === 0) flows.push({ day: first.day, amount: -first.value });
  const annualized = last?.value == null || points.some(p => p.flow === null)
    ? { percent: null, status: "insufficient-data" as const }
    : calculateXirr(flows);
  return {asOf:last?.day??null,dailyUsd:last?.dailyGainUsd??null,dailyPercent:last?.dailyGainPercent??null,totalPercent:twr,annualizedPercent:annualized.percent,annualizedStatus:annualized.status};
}
export type OverviewPerformanceMetrics=ReturnType<typeof overviewPerformanceMetrics>;
