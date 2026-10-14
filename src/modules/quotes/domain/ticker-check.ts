


import type { AssetKind } from "@/modules/portfolio/domain/asset-kinds";

export type TickerCheckRequest = {
  monthId: string;
  kind: AssetKind;
  ticker: string;

  coinId?: string;
};


export type CoinCandidate = { id: string; name: string };

export type TickerCheckResponse =

  | {
      status: "found";
      symbol: string;
      provider: string;
      priceBrl: number;
      name: string | null;
      quoteDate: string;
      token: string;

      coinId?: string | null;

      coins?: CoinCandidate[];
    }

  | { status: "known"; symbol: string; priceBrl: number }

  | { status: "not-found"; symbol: string; provider: string; message: string }

  | { status: "unavailable"; symbol: string; provider: string; code: string; message: string; token: string }

  | { status: "conflict"; symbol: string; message: string }
  | { status: "invalid"; message: string };


export function tickerCheckAllowsSaving(
  response: TickerCheckResponse | null,
): response is Extract<TickerCheckResponse, { status: "found" | "known" | "unavailable" }> {
  return response?.status === "found" || response?.status === "known" || response?.status === "unavailable";
}
