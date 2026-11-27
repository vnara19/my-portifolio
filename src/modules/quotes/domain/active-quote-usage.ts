/** Quotes also needed by the Overview reference strip, independent of holdings. */
export const REQUIRED_REFERENCE_QUOTES = ["USD", "EUR", "BTC"] as const;

/** A sold-out holding retains its history but no longer requires live repricing. */
export const activeQuotePositionWhere = { quantity: { gt: 0 } } as const;

export function visibleMonthQuoteSymbols({activeSymbols,storedSymbols,isCurrent}:{activeSymbols:Iterable<string>;storedSymbols:Iterable<string>;isCurrent:boolean}) {
 const priority=(symbol:string)=>symbol==="USD"?0:symbol==="EUR"?1:2;
 return [...new Set([...REQUIRED_REFERENCE_QUOTES,...activeSymbols,...(isCurrent?[]:storedSymbols)])]
  .sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b));
}
