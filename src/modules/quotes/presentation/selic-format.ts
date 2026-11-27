import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";

const percentFormat = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


export function formatSelic(rate: SelicMonthView | null) {
  return rate ? `${percentFormat.format(rate.percentAnnual)}% p.a.` : "—";
}


export function describeSelic(rate: SelicMonthView | null) {
  if (!rate) {
    return "Copom Selic target · awaiting scheduled update";
  }

  const day = rate.asOf.split("-").reverse().join("/");
  return `Copom Selic target on ${day} · Banco Central${rate.stale ? " · latest available" : ""}`;
}
