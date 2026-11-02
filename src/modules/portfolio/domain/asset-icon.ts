/** Issuer identity comes from the registered asset, never from an arbitrary URL. */
export function assetIcon(symbol:string,name="",assetType:string|null=null):string|null {
 const ticker=symbol.toUpperCase().replace(/^(?:[A-Z]+:)/,"");
 const identity=`${name} ${symbol}`;
 if(/^(BTC|BTCUSD|BTC-USD)$/.test(ticker)||/\bbitcoin\b/i.test(name))return "/asset-icons/bitcoin.svg";
 if(ticker==="UETW"||/\bubs\b/i.test(identity))return "/asset-icons/ubs.png";
 if(ticker==="CSH2"||/\bamundi\b/i.test(identity))return "/asset-icons/amundi.ico";
 if(["EGLN","PPFD"].includes(ticker)||/ishares|blackrock/i.test(identity))return "/asset-icons/ishares.ico";
 if(ticker==="XDWT"||/xtrackers|\bdws\b/i.test(identity))return "/asset-icons/xtrackers.ico";
 if(assetType==="treasury"||/tesouro direto|tesouro (selic|ipca|prefixado)/i.test(identity))return "/asset-icons/treasury.svg";
 const issuer=[[/vanguard/i,"vanguard.com"],[/invesco/i,"invesco.com"],[/itau|itaú/i,"itau.com.br"],[/santander/i,"santander.com.br"],[/bradesco/i,"bradesco.com.br"]] as const;
 const found=issuer.find(([pattern])=>pattern.test(identity));
 if(found)return `https://www.google.com/s2/favicons?domain=${found[1]}&sz=64`;
 // This source is specific to US symbols. Never reinterpret an ambiguous European symbol as a US company.
 if(["us-market","us-stock","us-etf"].includes(assetType??"")&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker))return `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(ticker)}.png`;
 return null;
}
