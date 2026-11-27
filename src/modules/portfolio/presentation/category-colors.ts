import { englishLabel } from "@/lib/english-labels";


/** Color-blind-friendly Okabe-Ito palette. Preserve color identity for both stored taxonomy keys and English display labels. */

// Use an accessible palette adjusted for the dark background (spec 038).

const OKABE_ITO = {
  orange: "#e69f00",
  sky: "#56b4e9",
  green: "#009e73",
  yellow: "#f0e442",
  blue: "#3d8fd6",
  vermillion: "#d55e00",
  purple: "#cc79a7",
  grey: "#bbbbbb",
} as const;

const CATEGORY_COLORS: Record<string, string> = {
  // Asset classes
  Caixa: OKABE_ITO.sky,
  Cripto: OKABE_ITO.orange,
  "Renda Fixa": OKABE_ITO.green,
  "Renda Variável": OKABE_ITO.yellow,
  Reserva: OKABE_ITO.purple,
  // Currencies
  BRL: OKABE_ITO.green,
  USD: OKABE_ITO.sky,
  BTC: OKABE_ITO.orange,
  Altcoins: OKABE_ITO.orange,
  EUR: OKABE_ITO.yellow,

  Core: OKABE_ITO.sky,
  "Core-Satellite": OKABE_ITO.orange,
  Hedge: OKABE_ITO.grey,
  Satellite: OKABE_ITO.yellow,


  "Ações EUA": OKABE_ITO.blue,
  "Ações BR": OKABE_ITO.green,
  "Ações - Ex: USA": OKABE_ITO.vermillion,
  "Imobiliário BR": OKABE_ITO.purple,
  Commoditie: OKABE_ITO.yellow,

  // Long-term assets use grey.
  Curto: OKABE_ITO.sky,
  Médio: OKABE_ITO.orange,
  Longo: OKABE_ITO.grey,
  "Cash Account": OKABE_ITO.sky,
  "Cryptocurrency": OKABE_ITO.orange,
  ETF: OKABE_ITO.yellow,
  CDB: OKABE_ITO.green,
  LCI: OKABE_ITO.green,
  LCA: OKABE_ITO.green,
  Bonds: OKABE_ITO.green,
  "Pension Plan": OKABE_ITO.purple,
  // Asset types (spec 068)
  "US ETF": OKABE_ITO.yellow,
  "US stock": OKABE_ITO.vermillion,
  "Brazilian ETF": OKABE_ITO.vermillion,
  "Brazilian stock or REIT": OKABE_ITO.purple,
  "Tesouro Direto": OKABE_ITO.green,
  "Fixed income": OKABE_ITO.blue,
  Previdência: OKABE_ITO.purple,
  "BRL cash": OKABE_ITO.sky,
  "USD cash": OKABE_ITO.grey,
};

for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
  CATEGORY_COLORS[englishLabel(key)] = color;
}

const FALLBACK_COLORS = [OKABE_ITO.blue, OKABE_ITO.vermillion, OKABE_ITO.purple, OKABE_ITO.yellow, OKABE_ITO.green];

export const UNCLASSIFIED_COLOR = "#6b7280";

export function categoryColor(label: string) {
  if (CATEGORY_COLORS[label]) {
    return CATEGORY_COLORS[label];
  }

  if (label === "Unclassified" || label === "No strategy") {
    return UNCLASSIFIED_COLOR;
  }

  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) % 997;
  }

  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
