"use client";

import { isAutomaticAccrualNote, englishTransactionNote } from "@/lib/transaction-notes";

import { englishLabel } from "@/lib/english-labels";

import { ArrowsDownUpIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { PositionTransactionView } from "@/modules/portfolio/application/get-position-history";
import { recordedByMonth, TRANSACTION_LABELS } from "@/modules/portfolio/domain/position-transactions";
import { formatDay } from "@/modules/portfolio/presentation/maturity";
import { formatBrl, formatPriceBrl } from "@/modules/portfolio/presentation/portfolio-format";
import { monthLabel } from "@/modules/portfolio/presentation/position-page";
import { CollapsibleSection } from "@/modules/portfolio/ui/collapsible-section";

const QUANTITY = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 8 });

type KindFilter = "all" | PositionTransactionView["kind"] | "AUTO_INCOME";


const FILTERS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "CONTRIBUTION", label: "Contributions" },
  { key: "INCOME", label: "Returns" },
  { key: "AUTO_INCOME", label: "Automatic accrual" },
  { key: "WITHDRAWAL", label: "Withdrawals" },
  { key: "OPENING", label: "Opening balance" },
];


function isAutomaticIncome(entry: PositionTransactionView) {
  return Boolean(entry.automatic) || (entry.kind === "INCOME" && isAutomaticAccrualNote(entry.note));
}

function filterKey(entry: PositionTransactionView): KindFilter {
  return isAutomaticIncome(entry) ? "AUTO_INCOME" : entry.kind;
}

function dayLabel(day: string) {
  return formatDay(new Date(`${day}T00:00:00.000Z`));
}


export function PositionTransactions({
  transactions,
  quoted,
  dollars,
  editableMonthId,
  editableAccountId,
  showAccountLabels = false,
  removing,
  onEdit,
  onRemove,
}: {
  transactions: PositionTransactionView[];
  editableAccountId: string;
  showAccountLabels?: boolean;
  quoted: boolean;
  dollars: boolean;

  editableMonthId: string | null;
  removing: boolean;
  onEdit: (entry: PositionTransactionView) => void;
  onRemove: (entry: PositionTransactionView) => void;
}) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const kinds = new Set(transactions.map(filterKey));
  const shown = filter === "all" ? transactions : transactions.filter((entry) => filterKey(entry) === filter);

  return (
    <CollapsibleSection
      id="position-transactions"
      title="Transactions"
      summary={`${transactions.length} ${transactions.length === 1 ? "registro" : "registros"}`}
      icon={<ArrowsDownUpIcon aria-hidden="true" className="text-primary" size={16} weight="bold" />}
      testId="position-transactions-section"
    >
      <div className="px-5 pt-1 pb-5 sm:px-6">
      {transactions.length > 0 ? <RecordedTotals transactions={transactions} /> : null}

      {transactions.length > 0 ? (
        <div role="group" aria-label="Transaction type" className="mt-4 flex flex-wrap items-center gap-1.5">
          {FILTERS.filter((option) => option.key === "all" || kinds.has(option.key)).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                filter === option.key
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {englishLabel(option.label)}
              {option.key === "all" ? null : (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">
                  {transactions.filter((entry) => filterKey(entry) === option.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {transactions.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[11px] text-muted-foreground">No transactions recorded.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs" data-testid="position-transactions">
            <thead>
              <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 pr-3">Type</th>
                {quoted ? <th className="py-2 pr-3 text-right">{dollars ? "US$" : "Quantity"}</th> : null}
                {quoted ? <th className="py-2 pr-3 text-right">{dollars ? "Exchange rate" : "Price"}</th> : null}
                <th className="py-2 pr-3 text-right">Value</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2" aria-label="Stocks" />
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => {
                const negative = entry.kind === "WITHDRAWAL" || entry.amountBrl < 0;

                const editable =
                  !entry.automatic && editableMonthId !== null && entry.monthId === editableMonthId && entry.accountId === editableAccountId;

                return (
                  <tr key={entry.id} className="border-t border-border/60" data-transaction-kind={entry.kind} data-transaction-filter={filterKey(entry)}>
                    <td className="py-2.5 pr-3 font-mono whitespace-nowrap text-muted-foreground">
                      {dayLabel(entry.occurredOn)}
                      <span className="ml-1.5 text-[10px] text-muted-foreground/70">{monthLabel(entry.month)}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                          entry.kind === "CONTRIBUTION" || (entry.kind === "INCOME" && entry.amountBrl >= 0)
                            ? "bg-chart-up/12 text-chart-up"
                            : entry.kind === "WITHDRAWAL"
                              ? "bg-chart-down/12 text-chart-down"
                              : "bg-white/[0.06] text-muted-foreground",
                        )}
                      >
                        {isAutomaticIncome(entry) ? "Automatic accrual" : TRANSACTION_LABELS[entry.kind]}
                      </span>
                      {entry.transferId ? (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">internal transfer</span>
                      ) : null}
                      {showAccountLabels ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">{entry.accountLabel}</p>
                      ) : null}
                    </td>
                    {quoted ? (
                      <td className="py-2.5 pr-3 text-right font-mono">
                        {entry.quantity === 0 ? "—" : QUANTITY.format(entry.quantity)}
                      </td>
                    ) : null}
                    {quoted ? (
                      <td className="py-2.5 pr-3 text-right font-mono text-muted-foreground">
                        {entry.unitPriceBrl ? formatPriceBrl(entry.unitPriceBrl) : "—"}
                      </td>
                    ) : null}
                    <td className={cn("py-2.5 pr-3 text-right font-mono", negative ? "text-chart-down" : "text-foreground")}>
                      {negative ? "−" : ""}
                      {formatBrl(Math.abs(entry.amountBrl))}
                    </td>
                    <td className="max-w-[200px] truncate py-2.5 pr-3 text-muted-foreground">{entry.note ? englishTransactionNote(entry.note) : ""}</td>
                    <td className="py-2.5 text-right">
                      {editable ? (
                        <span className="flex justify-end gap-0.5">
                          {entry.transferId ? null : (
                            <button
                              type="button"
                              aria-label={`Correct ${TRANSACTION_LABELS[entry.kind].toLocaleLowerCase("en-GB")} on ${dayLabel(entry.occurredOn)}`}
                              disabled={removing}
                              onClick={() => onEdit(entry)}
                              className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
                            >
                              <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Delete ${entry.transferId ? "liquidation" : TRANSACTION_LABELS[entry.kind].toLocaleLowerCase("en-GB")} on ${dayLabel(entry.occurredOn)}`}
                            disabled={removing}
                            onClick={() => onRemove(entry)}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
                          >
                            <TrashIcon aria-hidden="true" size={14} />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </CollapsibleSection>
  );
}


function RecordedTotals({ transactions }: { transactions: PositionTransactionView[] }) {
  const totals = [...recordedByMonth(transactions).values()].reduce(
    (sum, month) => ({
      contributions: sum.contributions + month.contributionsBrl,
      withdrawals: sum.withdrawals + month.withdrawalsBrl,
      income: sum.income + month.incomeBrl,
      opening: sum.opening + month.openingBrl,
    }),
    { contributions: 0, withdrawals: 0, income: 0, opening: 0 },
  );
  const items = [
    { label: "Contributions", value: totals.contributions },
    { label: "Withdrawals", value: totals.withdrawals },
    { label: "Returns", value: totals.income },
    ...(totals.opening > 0 ? [{ label: "Opening balance", value: totals.opening }] : []),
  ];

  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="recorded-totals">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border/70 px-3 py-2">
          <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(item.label)}</dt>
          <dd className="mt-0.5 font-mono text-xs text-foreground">{formatBrl(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
