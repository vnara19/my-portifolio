/** End-of-day TWR: value is after that day's external cash flows. */
export type TwrObservation = { day: string; value: number | null; flow: number | null; dailyGainUsd?: number | null; dailyGainPercent?: number | null };
export type TwrPoint = { day: string; percent: number | null };
export function timeWeightedReturns(observations: TwrObservation[]): TwrPoint[] {
  let previous: number | null = null;
  let factor = 1;
  let complete = true;
  return observations.map((point,index)=>{
    const value = point.value;
    if (value === null || !Number.isFinite(value) || value < 0 || point.flow === null) complete = false;
    if (index === 0) {
      previous = value;
      return {day:point.day,percent:complete ? 0 : null};
    }
    if (complete && previous !== null && value !== null) {
      const beforeFlow = value-point.flow!;
      if (beforeFlow < -1e-7 || (previous === 0 && Math.abs(beforeFlow)>1e-7)) complete=false;
      else if (previous > 0) factor *= Math.max(beforeFlow,0)/previous;
    }
    previous=value;
    return {day:point.day,percent:complete ? (factor-1)*100 : null};
  });
}
