/** Issuer identity comes from the registered asset, never from an arbitrary URL. */
export function assetIcon(symbol:string,name="",assetType:string|null=null,quoteSymbol:string|null=null):string|null {
 const ticker=symbol.toUpperCase().replace(/^(?:[A-Z]+:)/,"");
 const identity=`${name} ${symbol}`;
 if(/^(BTC|BTCUSD|BTC-USD)$/.test(ticker)||/\bbitcoin\b/i.test(name))return "/asset-icons/bitcoin.svg";
 if(ticker==="UETW"||/\bubs\b/i.test(identity))return "/asset-icons/ubs.svg";
 if(ticker==="CSH2"||/\bamundi\b/i.test(identity))return "/asset-icons/amundi.svg";
 if(["EGLN","PPFD"].includes(ticker)||/ishares|blackrock/i.test(identity))return "/asset-icons/ishares.svg";
 if(ticker==="XDWT"||/xtrackers|\bdws\b/i.test(identity))return "/asset-icons/xtrackers.svg";
 if(assetType==="treasury"||/tesouro direto|tesouro (selic|ipca|prefixado)/i.test(identity))return "/asset-icons/treasury.svg";
 // This source is specific to US symbols. Never reinterpret an ambiguous European symbol as a US company.
 if(["us-market","us-stock","us-etf"].includes(assetType??"")&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker))return `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(ticker)}.png`;
 const quote=quoteSymbol?.toUpperCase();
 if(quote&&/^[A-Z0-9-]{1,20}\.[A-Z]{1,4}$/.test(quote)&&["eu-market","br-market","br-stock","br-etf"].includes(assetType??""))return `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(quote)}.png`;
 return null;
}
