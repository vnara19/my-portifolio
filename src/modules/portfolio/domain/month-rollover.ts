import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";


export type GeneratedMonthView = {
  month: string;
  sourceMonth: string;
  isCurrent: boolean;
  positions: number;

  quotesFromHistory: string[];


  carriedQuotes: string[];
};

export type MonthRolloverOutcome =
  | { state: "up-to-date"; latestMonth: string | null }


  | { state: "pending"; latestMonth: string; months: string[] }
  | { state: "created"; months: GeneratedMonthView[] }

  | { state: "started"; month: string }
  | { state: "unavailable"; message: string };


export type TargetPlanCheck = "disabled" | "created" | "existing" | "no-positions" | "unavailable";

export type OpenCheckResponse = {
  rollover: MonthRolloverOutcome;
  targetPlan: TargetPlanCheck;
  summary: QuoteRefreshSummary | null;
};
