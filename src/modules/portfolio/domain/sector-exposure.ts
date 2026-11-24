/** GICS company sectors, with separate buckets for exposures outside that taxonomy. */
export const GICS_SECTORS = ["Energy", "Materials", "Industrials", "Consumer Discretionary", "Consumer Staples", "Health Care", "Financials", "Information Technology", "Communication Services", "Utilities", "Real Estate"] as const;
export type SectorSource = { label:string; url:string; asOf?:string; note:string };
export type SectorExposure = { weights:{sector:string;weight:number}[]; sources:SectorSource[] };
const worldSources = {
 current: "https://www.msci.com/documents/10199/4db922ce-68d2-446d-2f9e-4ed408a9db29",
 march: "https://swissfunddata.ch/sfdpub/docs/fsm-8522_03_03-20260331-de.pdf",
};
/** Dated, reviewed public factsheets. These snapshots are not a live holdings feed. */
const WORLD_SNAPSHOTS = [
 {asOf:"2026-03-31",url:worldSources.march,values:[25.7,16.3,11.8,9.6,9.3,8.5,5.7,4.7,3.6,2.9,1.9]},
 {asOf:"2026-10-30",url:worldSources.current,values:[29.84,16.15,10.76,10.19,8.68,7.16,5.37,4.59,3.15,2.5,1.6]},
];
const WORLD_SECTORS = ["Information Technology","Financials","Industrials","Health Care","Consumer Discretionary","Communication Services","Consumer Staples","Energy","Materials","Utilities","Real Estate"];
type SectorSecurity = {assetType:string;quoteSymbol:string|null;ticker:string|null;assetName:string;productType?:string;bondIssuer?:string};
const one=(sector:string,source?:SectorSource):SectorExposure=>({weights:[{sector,weight:100}],sources:source?[source]:[]});

export function sectorExposure(security:SectorSecurity,asOf:string):SectorExposure {
 const symbol=(security.quoteSymbol??security.ticker??"").toUpperCase();
 if(["UETW.DE","UETW"].includes(symbol)) {
  const snapshot=WORLD_SNAPSHOTS.filter(row=>row.asOf<=asOf).at(-1);
  if(!snapshot)return one("Sector Unavailable");
  const total=snapshot.values.reduce((sum,value)=>sum+value,0);
  return {weights:snapshot.values.map((weight,index)=>({sector:WORLD_SECTORS[index],weight:weight/total*100})),sources:[{label:"UETW · MSCI World index proxy",url:snapshot.url,asOf:snapshot.asOf,note:"Approximate fund exposure from its tracked index, not a live fund-holdings breakdown. Rounded source weights are normalized to 100%."}]};
 }
 if(["XDWT.DE","XDWT"].includes(symbol))return one("Information Technology",{label:"XDWT · DWS factsheet",url:"https://etf.dws.com/en-gb/AssetDownload/Index/c802a409-1f8c-4bd1-8be6-0e002e7a2613/Factsheet.pdf/",note:"Sector mandate: MSCI World Information Technology (GICS). Fund cash and tracking differences are not decomposed."});
 if(["EGLN.L","EGLN"].includes(symbol))return one("Gold",{label:"EGLN · iShares factsheet",url:"https://www.ishares.com/gls-download/literature/fact-sheet/sgln-ishares-physical-gold-etc-fund-fact-sheet-en-gb.pdf",note:"Physical gold exposure, not the financial sector of the issuing vehicle."});
 if(["CSH2.PA","CSH2"].includes(symbol))return one("Money Market",{label:"CSH2 · Amundi KID",url:"https://www.amundietf.lu/pdfDocuments/kid-priips/LU1190417599/ENG/LUX",note:"Economic exposure to compounded €STR. Collateral-company sectors are not used."});
 if(security.assetType==="treasury")return one("Government Bonds");
 if(security.productType&&["CDB","LCI","LCA"].includes(security.productType))return one("Financials",{label:"Bank debt · issuer sector",url:"https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf",note:"Bank-issued debt is grouped by its financial issuer, not by the issuer's loan-book industries."});
 if(security.assetType==="international-bond"&&/Morgan Stanley/i.test(security.bondIssuer??security.assetName))return one("Financials",{label:"Morgan Stanley · issuer sector",url:"https://www.morganstanley.com/about-us",note:"Corporate bond classified by its financial-services issuer."});
 if(security.assetType==="crypto"||security.productType==="Cryptocurrency")return one("Cryptocurrency");
 if(security.assetType==="savings"||/cash|balance/.test(security.assetType))return one("Cash & Savings");
 return one("Sector Unavailable");
}
