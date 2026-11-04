import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internationalBondSchema } from '@/modules/portfolio/domain/international-bond';
import { bondReportingUnitPrice } from '@/modules/portfolio/domain/bond-performance';
import { dailyOpenGain } from '@/modules/portfolio/domain/overview-performance-metrics';
const bond=internationalBondSchema.parse({type:'international-bond',identifier:'US61690D6W39',issuer:'Morgan Stanley',issuerCountry:'United States',family:'Corporate',currency:'USD',structure:'Fixed',maturityDate:'2030-06-20',faceAmount:'10000',faceValuePerBond:'1000',settlementDate:'2025-06-23',totalPaid:'9967.81',accruedInterestPaid:'70.7',valuationMode:'Cost',quotes:[],fixedCoupon:{annualRate:'4.3',frequency:2,anchorDate:'2026-12-18',dayCount:'Manual'}});
test('cost-only bonds have daily reporting values without inventing market quotes or coupon income',()=>{
 assert.equal(bondReportingUnitPrice(bond,'2025-06-23',5,5),0.996781);
 assert.equal(bondReportingUnitPrice(bond,'2026-11-04',5,5),0.996781);
 assert.equal(bondReportingUnitPrice(bond,'2026-11-04',5,6),0.8306508333333333);
 assert.equal(bondReportingUnitPrice(bond,'2025-06-22',5,5),null);
 assert.equal(bondReportingUnitPrice(bond,'2026-11-04',null,5),null);
});
test('a cost-only bond purchase is funding, not an immediate gain or missing daily value',()=>{
 const price=bondReportingUnitPrice(bond,'2025-06-23',5,5);
 const result=dailyOpenGain([{units:10000,oldUnits:0,newUnits:10000,newPrincipal:9967.81,currentPrice:price,previousPrice:null}]);
 assert.ok(Math.abs(result.amount!)<1e-8);assert.ok(Math.abs(result.percent!)<1e-8);
});
test('market bonds still require an actual dated valuation',()=>{
 const market={...bond,valuationMode:'Market' as const,quotes:[{date:'2026-11-01',marketValue:'9800',source:'Broker'}]};
 assert.equal(bondReportingUnitPrice(market,'2026-10-31',5,5),null);
 assert.ok(Math.abs(bondReportingUnitPrice(market,'2026-11-04',5,5)!-0.98)<1e-12);
});
