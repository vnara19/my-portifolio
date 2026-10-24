/** Display legacy taxonomy in English while preserving database and backup keys. */
const LABELS: Readonly<Record<string, string>> = {
  Caixa: "Cash",
  Cripto: "Cryptocurrency",
  "Renda Fixa": "Fixed Income",
  "Renda Variável": "Equities",
  Reserva: "Commodities",
  "Pós-fixado": "Floating-rate",
  Prefixado: "Fixed-rate",
  "Ações EUA": "US equities",
  "Ações - Ex: USA": "Non-US equities",
  "Ações BR": "Brazilian equities",
  "Imobiliário BR": "Brazilian real estate",
  Commoditie: "Commodities",
  Curto: "Short-term",
  Médio: "Medium-term",
  Longo: "Long-term",
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
