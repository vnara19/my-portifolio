/** Request-local index for sorted historical observations; never interpolate stale or future values. */
export function datedObservationLookup<T extends { day: string }>(observations: readonly T[], maxAgeDays = 7) {
 const points = observations.map((value, order) => ({ value, order, time: Date.parse(value.day) }))
  .filter(point => Number.isFinite(point.time))
  .sort((a, b) => a.time - b.time || a.order - b.order);
 return (day: string): T | null => {
  const time = Date.parse(day);
  if (!Number.isFinite(time)) return null;
  let lo = 0, hi = points.length - 1, selected = -1;
  while (lo <= hi) {
   const mid = (lo + hi) >>> 1;
   if (points[mid].time <= time) { selected = mid; lo = mid + 1; }
   else hi = mid - 1;
  }
  const point = points[selected];
  return point && time - point.time <= maxAgeDays * 86_400_000 ? point.value : null;
 };
}
