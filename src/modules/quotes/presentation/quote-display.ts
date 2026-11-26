import { positionTitle } from "@/modules/portfolio/presentation/position-display";

/** Provider identifiers stay unchanged; the quote list uses the Positions naming rules. */
export function quoteDisplayName(symbol:string,assets:string[]):string {
 if(symbol.startsWith("TD:")){
  const names=[...new Set(assets.map(name=>positionTitle(name,null)))];
  if(names.length)return names.join(", ");
  const year=symbol.match(/:(\d{4})-\d{2}-\d{2}$/)?.[1];
  return `Tesouro Direto${year?` ${year}`:""}`;
 }
 return symbol.replace(/\.(SAO|SA|DE|PA|L|SG|AS|MI|SW|TO|AX|HK)$/i,"");
}
