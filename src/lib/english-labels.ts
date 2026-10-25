/** Display legacy taxonomy in English while preserving database and backup keys. */
const LABELS: Readonly<Record<string, string>> = {
  Caixa: "Cash",
  Cripto: "Cryptocurrency",
  "Renda Fixa": "Fixed Income",
  "Renda Variável": "Equities",
  Reserva: "Commodities",
  "Pós-fixado": "Floating Rate",
  Prefixado: "Fixed Rate",
  "Ações EUA": "US Equities",
  "Ações - Ex: USA": "Non-US Equities",
  "Ações BR": "Brazilian Equities",
  "Imobiliário BR": "Brazilian Real Estate",
  Commoditie: "Commodities",
  Curto: "Short Term",
  Médio: "Medium Term",
  Longo: "Long Term",
  "Metas padrão": "Default targets",
  "Sem classificação": "Unclassified",
  "Sem estratégia": "No strategy",
  "Sem subclasse": "No subclass",
  "Renda fixa": "Fixed Income",
  Previdência: "Pension",
  "ETF dos EUA": "US ETF",
  "Ação dos EUA": "US stock",
  "ETF da B3": "Brazilian ETF",
  "Ação ou FII da B3": "Brazilian stock or REIT",
  "Caixa em reais": "BRL cash",
  "Caixa em dólar": "USD cash",
};

/** Translate known built-in labels, leaving names supplied by the user intact. */
export function englishLabel(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return LABELS[value] ?? value.split(/( \u00b7 | \u00d7 | \/ )/).map((part) => LABELS[part] ?? part).join("");
}
