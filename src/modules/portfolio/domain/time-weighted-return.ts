/** Daily TWR: inflows at the start, outflows at the end; values are after both. */
export type TwrObservation = {
  day: string; value: number | null; flow: number | null;
  inflow?: number | null; outflow?: number | null;
  dailyGainUsd?: number | null; dailyGainPercent?: number | null;
};
export type TwrPoint = { day: string; percent: number | null };

/** An explicitly funded first day includes its return. An existing valuation alone is only a baseline. */
export function returnBaselineDay(observations: TwrObservation[]): string | undefined {
  const first = observations[0];
  if (!first) return undefined;
  if (!Number.isFinite(Date.parse(first.day))) return undefined;
  return (first.inflow ?? Math.max(first.flow ?? 0, 0)) > 0
    ? new Date(Date.parse(first.day) - 86400000).toISOString().slice(0, 10) : first.day;
}

export function timeWeightedReturns(observations: TwrObservation[]): TwrPoint[] {
  let previous = 0;
  let factor = 1;
  let complete = true;
  return observations.map((point, index) => {
    const value = point.value;
    const inflow = point.inflow === undefined ? Math.max(point.flow ?? 0, 0) : point.inflow;
    const outflow = point.outflow === undefined ? Math.max(-(point.flow ?? 0), 0) : point.outflow;
    const tolerance = 1e-7 * Math.max(1, Math.abs(point.flow ?? 0), inflow ?? 0, outflow ?? 0);
    if (value === null || !Number.isFinite(value) || value < 0 || point.flow === null || !Number.isFinite(point.flow) ||
      inflow === null || outflow === null || !Number.isFinite(inflow) || !Number.isFinite(outflow) || inflow < 0 || outflow < 0 ||
      Math.abs(inflow - outflow - point.flow) > tolerance || !Number.isFinite(Date.parse(point.day)) || (index > 0 && point.day <= observations[index - 1].day)) complete = false;
    if (complete && value !== null && inflow !== null && outflow !== null) {
      if (index === 0 && inflow === 0 && outflow === 0) {
        previous = value;
        return { day: point.day, percent: 0 };
      }
      const start = previous + inflow;
      const end = value + outflow;
      if (start > 0) factor *= end / start;
      else if (Math.abs(end) > 1e-7) complete = false;
      if (!Number.isFinite(factor)) complete = false;
    }
    previous = value ?? 0;
    return { day: point.day, percent: complete ? (factor - 1) * 100 : null };
  });
}

/** Historical views must never include subsequent reporting months. */
export function historyThroughMonth<T extends { date: Date }>(history: readonly T[], referenceDate: Date): T[] {
  return history.filter(point => point.date.getTime() <= referenceDate.getTime());
}
