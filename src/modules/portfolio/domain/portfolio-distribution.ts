import type { SectorExposure, SectorSource } from "./sector-exposure";
export type DistributionHolding = { assetId:string; label:string; maturityDate?:string|null; assetClass:string; productType:string; sectorExposure?:SectorExposure; currency:string; valueUsd:number; unrealizedGainUsd:number|null };
export type DistributionRow = { key:string; label:string; maturityDate?:string|null; valueUsd:number; share:number; unrealizedGainUsd:number|null; color:string };
export type PortfolioDistribution = { assetCount:number; assets:DistributionRow[]; classes:DistributionRow[]; products:DistributionRow[]; sectors:DistributionRow[]; sectorSources:SectorSource[]; currencies:DistributionRow[] };
const COLORS = ["#4285ff","#49cbdc","#ff850d","#ad80f8","#ffc62f","#579de5","#ed6aa6","#42ba91"];

/** All views aggregate the same holdings in one reporting currency. Missing gains remain unknown. */
export function buildPortfolioDistribution(holdings:DistributionHolding[]):PortfolioDistribution {
  const active=holdings.filter(p=>Number.isFinite(p.valueUsd)&&p.valueUsd>0);
  const total=active.reduce((sum,p)=>sum+p.valueUsd,0);
  const group=(keyOf:(p:DistributionHolding)=>string,labelOf:(p:DistributionHolding)=>string)=>{
    const map=new Map<string,Omit<DistributionRow,"share"|"color">>();
    for(const p of active){
      const key=keyOf(p), previous=map.get(key);
      map.set(key,{key,label:labelOf(p),valueUsd:(previous?.valueUsd??0)+p.valueUsd,unrealizedGainUsd:previous?(previous.unrealizedGainUsd===null||p.unrealizedGainUsd===null?null:previous.unrealizedGainUsd+p.unrealizedGainUsd):p.unrealizedGainUsd});
    }
    return [...map.values()].sort((a,b)=>b.valueUsd-a.valueUsd||a.key.localeCompare(b.key)).map((row,index)=>({...row,share:total?row.valueUsd/total*100:0,color:COLORS[index%COLORS.length]}));
  };
  const sectorHoldings=active.flatMap(holding=>(holding.sectorExposure?.weights??[{sector:"Sector unavailable",weight:100}]).map(part=>({...holding,assetClass:part.sector,valueUsd:holding.valueUsd*part.weight/100,unrealizedGainUsd:null})));
  const sectors=buildSectorRows(sectorHoldings,total);
  const sectorSources=[...new Map(active.flatMap(holding=>holding.sectorExposure?.sources??[]).map(source=>[`${source.label}:${source.asOf??""}`,source])).values()];
  return {sectors,sectorSources,assetCount:new Set(active.map(p=>p.assetId)).size,assets:group(p=>p.assetId,p=>p.label).map(row=>({...row,maturityDate:active.find(p=>p.assetId===row.key)?.maturityDate})),classes:group(p=>p.assetClass,p=>p.assetClass),products:group(p=>p.productType,p=>p.productType),currencies:group(p=>p.currency,p=>p.currency)};
}

function buildSectorRows(holdings:DistributionHolding[],total:number):DistributionRow[] {
 const totals=new Map<string,number>();
 for(const holding of holdings)totals.set(holding.assetClass,(totals.get(holding.assetClass)??0)+holding.valueUsd);
 return [...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([label,valueUsd],index)=>({key:label,label,valueUsd,share:total?valueUsd/total*100:0,unrealizedGainUsd:null,color:COLORS[index%COLORS.length]}));
}
