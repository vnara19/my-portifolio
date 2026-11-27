/** Only an explicit annual percentage is accepted; allocation tolerance is never reused. */
export function parseRiskFreeRate(input:unknown):string|null {
 if(typeof input!=="string"||!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(input.trim()))return null;
 const normalized=input.trim().replace(",",".");
 return Number(normalized)<=100?normalized:null;
}
