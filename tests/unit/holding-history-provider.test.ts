import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchYahooHoldingHistory} from '../../src/modules/quotes/infrastructure/yahoo';
test('holdings history requests daily data instead of the downsampled maximum range',async()=>{
 const original=globalThis.fetch;const requests:string[]=[];
 const stamp=(day:string)=>Date.parse(`${day}T12:00:00Z`)/1000;
 globalThis.fetch=async(input)=>{const url=String(input);requests.push(url);const origin=url.includes('period1=');return new Response(JSON.stringify({chart:{error:null,result:[{meta:{currency:'EUR',firstTradeDate:stamp('2010-01-04'),fullExchangeName:'XETRA',exchangeTimezoneName:'UTC'},timestamp:origin?[stamp('2010-01-04')]:[stamp('2026-10-30'),stamp('2026-11-02')],indicators:{quote:[{close:origin?[10]:[99,100],high:origin?[11]:[100,102],low:origin?[9]:[98,99],volume:origin?[500]:[1000,2000]}]}}]}}));};
 try{const data=await fetchYahooHoldingHistory('TEST.DE');assert.equal(new URL(requests[0]).searchParams.get('range'),'10y');assert.equal(new URL(requests[0]).searchParams.get('interval'),'1d');assert.ok(requests[1].includes('period1='));assert.equal(data.allTimeAvailable,true);assert.equal(data.points[0].value,10);assert.equal(data.points.at(-1)?.volume,2000);assert.equal(data.points.at(-1)?.day,'2026-11-02');assert.equal(data.exchange,'XETRA');}finally{globalThis.fetch=original;}
});
