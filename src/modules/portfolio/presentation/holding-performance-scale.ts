/** Filter at display precision so rounded zero and floating-point residue stay hidden. */
export function hasDisplayedHoldingGain(value: number | null) {
  return value !== null && Number.isFinite(value) && Math.abs(value) >= 0.005;
}

export function holdingPerformanceScale(values: number[]) {
  const maximum = Math.max(0.01, ...values.filter(Number.isFinite).map(Math.abs));
  const target = maximum / 3;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= target)!;
  return { maximum: step * 3, ticks: [0, step, step * 2, step * 3] };
}
