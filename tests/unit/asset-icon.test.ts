import {test} from "node:test";
import assert from "node:assert/strict";
import {assetIcon} from "../../src/modules/portfolio/domain/asset-icon";
import {existsSync} from "node:fs";

test("current holdings and treasury resolve to local issuer icons",()=>{
 for(const symbol of ["UETW","CSH2","EGLN","PPFD","XDWT","BTCUSD"]){const source=assetIcon(symbol);assert.ok(source?.startsWith("/asset-icons/"));assert.ok(existsSync(`public${source}`));}
 assert.ok(existsSync(`public${assetIcon("Tesouro Selic","","treasury")}`));
});
test("unknown or ambiguous instruments never receive a guessed US issuer",()=>{
 assert.equal(assetIcon("ABC","Unknown","eu-market"),null);
 assert.equal(assetIcon("<script>","Unknown","us-stock"),null);
 assert.equal(assetIcon("AAPL","Apple","us-stock"),"https://images.financialmodelingprep.com/symbol/AAPL.png");
 assert.equal(assetIcon("NEW","UBS World Fund","eu-market"),"/asset-icons/ubs.png");
});
