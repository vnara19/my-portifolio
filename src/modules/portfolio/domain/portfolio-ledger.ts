/** Portfolio value changes are distinct from external funding and opening adjustments. */
export type PortfolioLedgerFrame = { month: string; value: number | null; flow: number | null; opening: number | null; estimated: boolean };
export type PortfolioLedgerRow = PortfolioLedgerFrame & { change: number | null; changePercent: number | null; investmentChange: number | null };
export function portfolioLedgerRows(frames: PortfolioLedgerFrame[]): PortfolioLedgerRow[] {
  return frames.map((frame,index)=>{
    const previous=frames[index-1];
    const consecutive=previous && new Date(Date.UTC(Number(previous.month.slice(0,4)),Number(previous.month.slice(5,7)),1)).toISOString().slice(0,7)===frame.month;
    const change=consecutive && frame.value!==null && previous.value!==null ? frame.value-previous.value : null;
    return {...frame,change,changePercent:change!==null && previous!.value!==null && previous!.value>0 ? change/previous!.value*100:null,
      investmentChange:change!==null && frame.flow!==null && frame.opening!==null ? change-frame.flow-frame.opening:null};
  });
}
