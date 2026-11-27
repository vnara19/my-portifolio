type BondLabelInput = { assetId:string; bondIssuer?:string; maturityDate:string|null };

/** Keep identifiers in asset details; add the month only for issuer/year collisions. */
export function bondChartLabels(positions:BondLabelInput[]):Map<string,string> {
  const bonds=[...new Map(positions.filter(p=>p.bondIssuer&&p.maturityDate).map(p=>[p.assetId,p])).values()];
  const groups=new Map<string,number>();
  const key=(p:BondLabelInput)=>`${p.bondIssuer!.trim().toLowerCase()}|${p.maturityDate!.slice(0,4)}`;
  for(const bond of bonds)groups.set(key(bond),(groups.get(key(bond))??0)+1);
  return new Map(bonds.map(bond=>{
    const date=new Date(`${bond.maturityDate}T00:00:00Z`);
    const maturity=new Intl.DateTimeFormat("en-GB",{year:"numeric",...((groups.get(key(bond))??0)>1?{month:"short" as const}:{}),timeZone:"UTC"}).format(date);
    return [bond.assetId,`${bond.bondIssuer!.trim()} ${maturity}`];
  }));
}
