export type DistributionHolding = { assetId:string; label:string; assetClass:string; currency:string; valueUsd:number; unrealizedGainUsd:number|null };
export type DistributionRow = { key:string; label:string; valueUsd:number; share:number; unrealizedGainUsd:number|null; color:string };
export type PortfolioDistribution = { assetCount:number; assets:DistributionRow[]; types:DistributionRow[]; currencies:DistributionRow[] };
const COLORS = ["#4285ff","#49cbdc","#ff850d","#ad80f8","#ffc62f","#579de5","#ed6aa6","#42ba91"];

/** All three views aggregate the same holdings in one reporting currency. Missing gains remain unknown. */
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
  return {assetCount:new Set(active.map(p=>p.assetId)).size,assets:group(p=>p.assetId,p=>p.label),types:group(p=>p.assetClass,p=>p.assetClass),currencies:group(p=>p.currency,p=>p.currency)};
}
