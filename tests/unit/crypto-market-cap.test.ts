import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCoinGeckoMarketCap} from '../../src/modules/quotes/infrastructure/coingecko';
test('capitalization is read in its requested currency, rather than derived from a fixed supply',async()=>{
 const original=globalThis.fetch;let requested='';
 globalThis.fetch=async input=>{requested=String(input);return new Response(JSON.stringify({bitcoin:{usd:77000,usd_market_cap:1540000000000,eur_market_cap:1370000000000}}));};
 try{assert.equal(await fetchCoinGeckoMarketCap('bitcoin','USD'),1540000000000);assert.equal(new URL(requested).searchParams.get('include_market_cap'),'true');assert.equal(new URL(requested).searchParams.get('vs_currencies'),'usd');assert.equal(await fetchCoinGeckoMarketCap('bitcoin','EUR'),1370000000000);assert.equal(await fetchCoinGeckoMarketCap('bitcoin','BRL'),null);}finally{globalThis.fetch=original;}
});
