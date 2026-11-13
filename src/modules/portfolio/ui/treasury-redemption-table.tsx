import type { PositionTransactionView } from "../application/get-position-history";
import { treasuryRedemptionRows } from "../domain/treasury-redemption";
import { formatCurrency } from "../presentation/portfolio-format";

const date = (day: string) => day.split("-").reverse().join("/");
const money = (value: number | null) => value === null ? "—" : formatCurrency(value, "BRL");
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;
const number = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TreasuryRedemptionTable({ transactions, asOf, quote, symbol, maturity }: {
  transactions: PositionTransactionView[];
  asOf: string;
  quote: { day: string; price: number } | null | undefined;
  symbol: string;
  maturity: string | null;
}) {
  const rows = treasuryRedemptionRows(transactions, asOf, quote?.price ?? null, symbol, maturity);
  if (!rows.length) return null;
  const headers = ["Purchase Date", "Quantity", "Purchase Price", "Invested Amount", "Contracted Return",
    "Annualized Return (Nominal)", "Accumulated Return", "Gross Value", "Days Held", "Income Tax Rate",
    "Income Tax", "IOF", "B3 Custody (Est.)", "Estimated Net Value"];

  return (
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="treasury-redemption-title">
      <h2 id="treasury-redemption-title" className="text-base font-semibold">Tesouro Direto · Early Redemption</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {maturity ? `Maturity ${date(maturity)} · ` : ""}{quote ? `Market Quote ${date(quote.day)}` : "Market Quote unavailable"}
      </p>
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tesouro Direto purchase details">
        <table className="w-full min-w-[1040px] text-right text-xs">
          <thead><tr className="border-b border-border text-muted-foreground">
            {headers.map((header, index) => <th key={header} scope="col" className={`px-2 py-3 font-medium ${index === 0 ? "text-left" : ""}`}>{header}</th>)}
          </tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id} className="border-b border-border/60 last:border-0">
              <th scope="row" className="whitespace-nowrap px-2 py-3 text-left font-medium">{date(row.day)}</th>
              {[
                number.format(row.quantity), money(row.price), money(row.invested),
                row.contracted ? `${row.contracted.indexer === "Fixed" ? "" : `${row.contracted.indexer} + `}${percent(row.contracted.rate)}` : "—",
                percent(row.annualized), percent(row.accumulated), money(row.gross), row.days,
                percent(row.taxRate), money(row.ir), money(row.iof), money(row.custody), money(row.net),
              ].map((value, index) => <td key={index} className="whitespace-nowrap px-2 py-3 font-mono">{value}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
