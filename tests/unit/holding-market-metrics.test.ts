import test from 'node:test';
import assert from 'node:assert/strict';
import {holdingMarketMetrics,holdingBeta,holdingCutoff,type MarketPoint} from '../../src/modules/portfolio/domain/holding-market-metrics';
test('holding price performance ignores purchases, uses trailing 30-day 1M offsets and rejects short histories',()=>{
 const points=[{day:'2026-01-30',value:100},{day:'2026-02-27',value:110},{day:'2026-03-02',value:121},{day:'2026-03-30',value:133.1}];
 assert.equal(holdingCutoff('2026-03-31','1m'),'2026-03-01');
 const metrics=holdingMarketMetrics(points,'2026-03-31');
 assert.ok(Math.abs(metrics.performance['1m']!-21)<1e-10);
 assert.equal(metrics.performance['5y'],null);
 assert.equal(metrics.volume,null);
 assert.equal(metrics.volatility['1m'],null);
 assert.equal(holdingMarketMetrics(points,'2026-04-30').last,null);
});
test('daily volatility is true range; weekly and monthly volatility use daily high-low percentages',()=>{
 const points:MarketPoint[]=Array.from({length:41},(_,i)=>({day:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),value:100,high:102,low:100,volume:100+i}));
 points[40]={...points[40],value:110,high:112,low:110};
 const result=holdingMarketMetrics(points,'2026-02-10');
 assert.ok(Math.abs(result.volatility['1d']!-12/110*100)<1e-10);
 assert.ok(Math.abs(result.volatility['1w']!-(6*2+2/110*100)/7)<1e-10);
 assert.equal(result.averageVolume,134.5);
 assert.equal(result.volume,140);
});
test('beta requires full aligned monthly history and equals one for the benchmark itself',()=>{
 const points:MarketPoint[]=Array.from({length:75},(_,i)=>({day:new Date(Date.UTC(2020,0+i+1,0)).toISOString().slice(0,10),value:100+i+Math.sin(i)*3}));
 assert.ok(Math.abs(holdingBeta(points,points,'2026-03-10',5)!-1)<1e-10);
 assert.equal(holdingBeta(points.slice(-8),points,'2026-03-10',1),null);
});

test("holding 1M performance uses exactly 30 trailing days",()=>{
 assert.equal(holdingCutoff("2026-11-05","1m"),"2026-10-06");
});

test("Treasury redemption prices support movements without exchange volume or ranges", () => {
 const points = [
  { day: "2026-11-02", value: 100 },
  { day: "2026-11-06", value: 110 },
  { day: "2026-11-09", value: 99 },
 ];
 const result = holdingMarketMetrics(points, "2026-11-09", [], "close");
 assert.equal(result.change, -11);
 assert.ok(Math.abs(result.changePercent! + 10) < 1e-10);
 assert.ok(Math.abs(result.volatility["1d"]! - 10) < 1e-10);
 assert.ok(Math.abs(result.volatility["1w"]! - 10) < 1e-10);
 assert.equal(result.volatility["1m"], null);
 assert.equal(result.volume, null);
 assert.equal(result.averageVolume, null);
 assert.equal(result.beta["1"], null);
});
