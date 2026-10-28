"use client";
import { TradeCorrectionDialog } from "./trade-correction-dialog";
import { investmentMonthReturn } from "../domain/position-money";
import { usePositionMoney } from "./position-money-context";

import { PositionMoneyProvider } from "./position-money-context";
import { liquidityLabel } from "@/lib/liquidity-labels";
import { bondCostReturn } from "../domain/international-bond";

import { englishLabel } from "@/lib/english-labels";

import { Dialog } from "@base-ui/react/dialog";
import NumberFlow from "@number-flow/react";
import { ArrowLeftIcon, ChartPieSliceIcon, CoinsIcon, HandCoinsIcon, InfoIcon, MagnifyingGlassIcon, TrashIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useRef, useState, useTransition } from "react";

import { removePositionAction, removeTransactionAction, undoChangeAction, type EditActionResult } from "@/app/actions/edit-month";
import { KpiCard } from "@/components/product/kpi-card";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";
import type { PositionHistoryView, PositionTransactionView } from "@/modules/portfolio/application/get-position-history";
import type { HistorySlot, PositionSummary, PresentSlot } from "@/modules/portfolio/domain/position-history";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";

import { allocationLabel } from "@/modules/portfolio/presentation/position-filters";
import { formatQuantity, monthLabel, monthRangeLabel, positionHref, positionsTableHref } from "@/modules/portfolio/presentation/position-page";
import { AssetPriceChart } from "@/modules/portfolio/ui/asset-price-chart";
import { BalanceChangeChart } from "@/modules/portfolio/ui/balance-change-chart";
import { backdropClass, centeredPopupClass, secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, handOffToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { ChangeKpiCard } from "@/modules/portfolio/ui/kpi-card";
import { PositionEvolutionChart } from "@/modules/portfolio/ui/position-evolution-chart";
import { MonthHighlights } from "@/modules/portfolio/ui/position-highlights";
import { type PositionFormMonth } from "@/modules/portfolio/ui/position-form-dialog";
import { PositionMonthsTable } from "@/modules/portfolio/ui/position-months-table";
import { PositionTransactionDialog, transactionMonthOf, type TransactionEdit, type TransactionMonth, type TransactionTarget } from "@/modules/portfolio/ui/position-transaction-dialog";
import { PositionTransactions } from "@/modules/portfolio/ui/position-transactions";
import { InternationalBondPanel } from "./international-bond-panel";
import { CdiPanel } from "@/modules/portfolio/ui/cdi-panel";
import { ratesLabel } from "@/modules/portfolio/presentation/income-rate";
import { recordedByMonth } from "@/modules/portfolio/domain/position-transactions";

const SCOPES = ["todas"] as const;


const signedPercent = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const sharePercent = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});


export type PositionEditing = {
  position: MonthPosition | null;
  month: PositionFormMonth & { isLocked: boolean };
  occupied: string[];
  catalog: EditingCatalog;
};

export function PositionDetail(props: {history: PositionHistoryView | null; editing: PositionEditing | null}) {
  return <PositionMoneyProvider currency={props.history?.displayCurrency ?? "BRL"}><PositionDetailContent {...props} /></PositionMoneyProvider>;
}
function PositionDetailContent({
  history: storedHistory,
  editing,
}: {
  history: PositionHistoryView | null;
  editing: PositionEditing | null;
}) {

  const history = storedHistory && storedHistory.native ? {...storedHistory,account:storedHistory.native.account,all:storedHistory.all?storedHistory.native.all:null,prices:storedHistory.native.prices} : storedHistory;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();


  const [scopeParam, setScopeParam] = useQueryState("contas", parseAsStringLiteral(SCOPES).withOptions({ shallow: false }));
  const [movement, setMovement] = useState<{ open: boolean; key: number; edit: TransactionEdit | null; target?: TransactionTarget; month?: TransactionMonth }>({
    open: false,
    key: 0,
    edit: null,
  });

  const [tradeCorrection, setTradeCorrection] = useState<PositionTransactionView | null>(null);
  const [removal, setRemoval] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const [isRemoving, startRemoving] = useTransition();
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isUndoing, startUndo] = useTransition();
  const sequence = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const backHref = positionsTableHref(searchParams);

  const notify = (result: EditActionResult) =>
    setToast({
      id: ++sequence.current,
      tone: result.ok ? "success" : "error",
      message: result.message,
      undoToken: result.ok ? result.undoToken : undefined,
    });
  const undo = (token: string) =>
    startUndo(async () => {
      const result = await undoChangeAction(token);
      notify(result);
      if (result.ok) {
        router.refresh();
      }
    });

  if (!history) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <MagnifyingGlassIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Position not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">No reporting month contains this account and asset combination.
        </p>
        <BackLink href={backHref} className="mt-6" />
      </div>
    );
  }

  const scope: "account" | "all" = scopeParam === "todas" && history.all ? "all" : "account";
  const view = scope === "all" && history.all ? history.all : history.account;
  const { slots, summary } = view;
  const performances = slots.flatMap((slot,index)=>{
    if(slot.kind!=="present" || !slot.step || slot.month>history.selectedMonth)return [];
    const previous=slots[index-1];
    const result=investmentMonthReturn(slot,previous?.kind==="present"?previous.valueBrl:null);
    return result.amount===null?[]:[{...slot.step,month:slot.month,changeBrl:result.amount,changePercent:result.percent,pricePercent:result.percent}];
  });
  const ranked=performances.filter(p=>p.changePercent!==null).sort((a,b)=>b.changePercent!-a.changePercent!);
  const performanceSummary={...view.summary,monthStep:performances.find(p=>p.month===history.selectedMonth)??null,best:ranked.length>1?ranked[0]:null,worst:ranked.length>1?ranked.at(-1)!:null};


  const transactions = view.transactions;
  const quoted = Boolean(history.quoteSymbol);
  const atCost = history.bond?.valuationMode === "Cost";
  const costReturn = atCost && summary.current ? bondCostReturn(summary.current.valueBrl, transactions.filter((entry) => entry.occurredOn <= history.referenceDay)) : null;
  const dollarBalance = history.quoteSymbol === "USD";
  const current = summary.current;
  const snapshot = current ?? lastPresentUpTo(slots, history.selectedMonth) ?? firstPresent(slots);
  const selectedLabel = monthLabel(history.selectedMonth);
  const firstEver = firstPresent(slots)?.month ?? null;
  const allocations = snapshot?.allocations ?? [];


  const singleAllocation = allocations.length === 1 ? allocations[0] : null;
  const classes = singleAllocation ? [] : [...new Set(allocations.map((slice) => slice.assetClass))];
  const editPosition = editing?.position ?? null;
  const editBlocked = !editing
    ? "Unavailable."
    : !editPosition
        ? `No position in ${selectedLabel}.`
        : null;




  const lastSlot = [...slots].reverse().find((slot): slot is PresentSlot => slot.kind === "present") ?? null;
  const exit = current?.liquidated ? current : lastSlot?.liquidated ? lastSlot : null;
  const exitParams = new URLSearchParams(searchParams.toString());
  if (exit) {
    exitParams.set("mes", exit.month);
  }

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-24 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <BackLink href={backHref} />
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] break-words sm:text-[2.65rem]">
            {history.assetName}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
            <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-foreground/85">
              {history.ticker ?? "BALANCE"}
            </span>

          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="position-chips">
            {exit ? (
              exit.month === history.selectedMonth ? (
                <span
                  data-testid="position-liquidated"
                  className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/85"
                >Liquidated on {formatDayKey(exit.liquidatedOn)}
                </span>
              ) : (
                <Link
                  href={`${pathname}?${exitParams.toString()}`}
                  data-testid="position-liquidated"
                  className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/85 outline-none transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >Liquidated on {formatDayKey(exit.liquidatedOn)}
                </Link>
              )
            ) : null}
            {singleAllocation ? (
              <span
                title="Asset classification"
                data-testid="position-single-allocation"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(singleAllocation.assetClass) }} />
                {allocationLabel(singleAllocation)}
              </span>
            ) : null}
            {classes.map((assetClass) => (
              <span
                key={assetClass}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(assetClass) }} />
                {englishLabel(assetClass)}
              </span>
            ))}
            {history.maturityDate ? (
              <span className="font-mono text-xs text-muted-foreground">{formatDayKey(history.maturityDate)}</span>
            ) : null}


            {history.rate ? (
              <span
                data-testid="position-rate"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                <span className="text-foreground/85">{ratesLabel(history.rate.parts)}</span>
                {history.rate.automatic ? <span className="text-primary">· automatic</span> : null}
              </span>
            ) : null}
            {history.liquidity ? (
              <span
                data-testid="position-liquidity"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
              >Liquidity · <span className="whitespace-nowrap text-foreground/85">{liquidityLabel(history.liquidity)}</span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {editBlocked === null ? (
              <button
                type="button"
                onClick={() => setRemoval(true)}
                title={`Remove the record for ${selectedLabel}`}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <TrashIcon aria-hidden="true" size={14} />Remove
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {history.all ? (
        <section
          aria-label="Asset accounts"
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div role="group" aria-label="Included accounts" className="flex w-fit items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
            {(
              [
                { key: "account", label: "In this account" },
                { key: "all", label: "All accounts" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={scope === option.key}
                onClick={() => void setScopeParam(option.key === "all" ? "todas" : null)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  scope === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {englishLabel(option.label)}
              </button>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Also in{" "}
            {history.otherAccounts.map((other, index) => (
              <span key={other.accountId}>
                {index > 0 ? (index === history.otherAccounts.length - 1 ? " and " : ", ") : null}
                <Link
                  href={positionHref(other.accountId, history.assetId, searchParams)}
                  className="rounded-sm text-foreground/85 underline decoration-border underline-offset-4 outline-none transition-colors hover:text-foreground hover:decoration-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Position {index + 1}
                </Link>{" "}
                ({monthRangeLabel(other.firstMonth, other.lastMonth)})
              </span>
            ))}
          </p>
        </section>
      ) : null}

      {summary.state !== "present" ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3" data-testid="position-absent">
          <InfoIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={16} weight="duotone" />
          <p className="text-xs text-muted-foreground">
            {summary.state === "before" && firstEver
              ? `The position first appears in ${monthLabel(firstEver)}; in ${selectedLabel} did not exist yet.`
              : summary.lastPresentMonth
                ? `No position in ${selectedLabel}${scope === "account" ? " in this account" : ""}. Last reporting month containing it: ${monthLabel(summary.lastPresentMonth)}.`
                : `No position in ${selectedLabel}.`}
          </p>
        </div>
      ) : null}

      {storedHistory?.native?.error ? <p role="status" className="mt-5 text-sm text-warning-foreground">{storedHistory.native.error}</p> : null}
      <div className="mt-7">
        <PositionKpis
          costReturn={costReturn}
          atCost={atCost}
          summary={performanceSummary}
          quoted={quoted}
          quoteSymbol={history.quoteSymbol}
          ticker={history.ticker}
          approximateCost={storedHistory?.native?.estimated ?? false}
          selectedLabel={selectedLabel}
          firstEver={firstEver}
          dollarBalance={dollarBalance}
        />
      </div>


      <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="position-evolution-title">
        <h2 id="position-evolution-title" className="text-base font-semibold tracking-[-0.025em]">{atCost ? "Carrying Value Over Time" : "Position Value Over Time"}
        </h2>
        <div className="mt-5">
          <PositionEvolutionChart
            slots={slots}
            selectedMonth={history.selectedMonth}
            quoted={quoted}
            quoteSymbol={history.quoteSymbol}
            ticker={history.ticker}
            scopeLabel={scope}
          />
        </div>
      </section>

      {history.prices && history.quoteSymbol ? (
        <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="asset-price-title">
          <h2 id="asset-price-title" className="text-base font-semibold tracking-[-0.025em]">
            {history.quoteSymbol === "USD" ? "USD exchange rate" : `Quote for ${history.ticker ?? history.quoteSymbol}`}
          </h2>
          <PriceHistoryNotice state={history.history} />
          <div className="mt-5">
            <AssetPriceChart
              prices={history.prices}
              symbol={history.quoteSymbol}
              selectedMonth={history.selectedMonth}
              averagePriceBrl={summary.averagePriceBrl}
              averageLabel={averagePriceLabel(summary.costSource, dollarBalance)}
              markers={transactions.flatMap((entry) =>
                (entry.kind === "CONTRIBUTION" || entry.kind === "WITHDRAWAL") && entry.unitPriceBrl
                  ? [{ day: entry.occurredOn, kind: entry.kind, unitPriceBrl: entry.unitPriceBrl }]
                  : [],
              )}
            />
          </div>
        </section>
      ) : quoted ? (
        <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7" aria-labelledby="asset-price-title">
          <h2 id="asset-price-title" className="text-base font-semibold tracking-[-0.025em]">Quote for {history.ticker ?? history.quoteSymbol}
          </h2>
          <PriceHistoryNotice state={history.history} />
        </section>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <section className="premium-panel rounded-[24px] p-5 sm:p-7" aria-labelledby="balance-change-title">
          <h2 id="balance-change-title" className="text-base font-semibold tracking-[-0.025em]">Monthly Balance Change
          </h2>
          <div className="mt-5">
            <BalanceChangeChart slots={slots} selectedMonth={history.selectedMonth} scope={scope} />
          </div>
        </section>
      </div>



      {history.bond ? <InternationalBondPanel faceHeld={editing?.position?.quantity ?? Number(history.bond.faceAmount)} bond={history.bond} asOf={history.referenceDay} monthId={null} positionId={null} /> : null}
      {history.cdi ? <CdiPanel cdi={history.cdi} /> : null}

      <PositionMonthsTable
        slots={slots}
        selectedMonth={history.selectedMonth}
        quoted={quoted}
        quoteSymbol={history.quoteSymbol}
        ticker={history.ticker}
        scope={scope}
        recorded={recordedByMonth(view.transactions)}
      />


      <PositionTransactions
        transactions={transactions}
        selectedMonth={history.selectedMonth}
        defaultPeriod={searchParams.has("mes") ? "month" : "all"}
        quoted={quoted}
        dollars={dollarBalance}
        editableMonthId={!history.bond ? "all" : null}
        editableAccountId={scope === "all" ? null : history.accountId}
        showAccountLabels={scope === "all"}
        removing={isRemoving}
        onEdit={(entry) => {
          if (quoted && !dollarBalance && (entry.kind === "CONTRIBUTION" || entry.kind === "WITHDRAWAL")) { setTradeCorrection(entry); return; }
          setMovement((value) => ({
            open: true,
            key: value.key + 1,
            month: transactionMonthOf(entry.monthId, new Date(`${entry.month}-01T00:00:00Z`)),
            target: { positionId: entry.positionId!, assetName: history.assetName, quoteSymbol: history.quoteSymbol, quantity: storedHistory?.account.slots.find((s): s is PresentSlot=>s.kind==="present" && s.month===entry.month)?.quantity ?? entry.quantity, unitPriceBrl: storedHistory?.transactions.find(t=>t.id===entry.id)?.unitPriceBrl ?? null, totalBrl: storedHistory?.transactions.find(t=>t.id===entry.id)?.amountBrl ?? entry.amountBrl },
            edit: {
              id: entry.id,
              kind: entry.kind,
              occurredOn: entry.occurredOn,
              quantity: entry.quantity,
              unitPriceBrl: storedHistory?.transactions.find(t=>t.id===entry.id)?.unitPriceBrl ?? entry.unitPriceBrl,
              amountBrl: storedHistory?.transactions.find(t=>t.id===entry.id)?.amountBrl ?? entry.amountBrl,
              note: entry.note,
            },
          }));
        }}
        onRemove={(entry) =>
          startRemoving(async () => {
            const result = await removeTransactionAction({ monthId: entry.monthId, transactionId: entry.id });
            notify(result);
          })
        }
      />

      {tradeCorrection ? <TradeCorrectionDialog entry={tradeCorrection} original={storedHistory?.transactions.find(t=>t.id===tradeCorrection.id) ?? tradeCorrection} onClose={()=>setTradeCorrection(null)} onSaved={notify}/> : null}
      {movement.target && movement.month ? (
        <PositionTransactionDialog
          open={movement.open}
          onOpenChange={(open) => setMovement((value) => ({ ...value, open }))}
          target={movement.target}
          edit={movement.edit}
          formKey={movement.key}
          month={movement.month}
          onSaved={notify}
        />
      ) : null}

      {editing && editPosition ? (
        <Dialog.Root open={removal} onOpenChange={(open) => !isDeleting && setRemoval(open)}>
          <Dialog.Portal>
            <Dialog.Backdrop className={backdropClass} />
            <Dialog.Popup className={centeredPopupClass}>
              <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Remove {editPosition.assetName}?
              </Dialog.Title>

              <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{editPosition.assetType === "savings" ? "Removes this Savings registration from all reporting months. Use Withdraw Money for an actual withdrawal. Undo is available." : `Deletes this position in ${selectedLabel}. Record an actual sale from Positions to preserve its history.`}</Dialog.Description>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Dialog.Close className={secondaryButtonClass} disabled={isDeleting}>Cancel
                </Dialog.Close>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() =>
                    startDeleting(async () => {
                      const result = await removePositionAction({ monthId: editing.month.id, positionId: editPosition.id });
                      setRemoval(false);
                      if (result.ok) {


                        handOffToast({ tone: "success", message: result.message, undoToken: result.undoToken });
                        router.push(backHref);
                      } else {
                        notify(result);
                      }
                    })
                  }
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-destructive px-3.5 text-xs font-semibold text-white outline-none transition-[background-color,transform] duration-150 hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-destructive/40 active:scale-[0.98] disabled:opacity-50"
                >
                  <TrashIcon aria-hidden="true" size={14} />
                  {isDeleting ? "Removing…" : "Remove"}
                </button>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </div>
  );
}

function PositionKpis({
  costReturn,
  atCost,
  summary,
  quoted,
  quoteSymbol,
  ticker,
  approximateCost,
  selectedLabel,
  firstEver,
  dollarBalance,
}: {
  costReturn?: { gainBrl: number; contributionsBrl: number } | null;
  atCost?: boolean;
  summary: PositionSummary;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  approximateCost: boolean;
  selectedLabel: string;
  firstEver: string | null;
  dollarBalance: boolean;
}) {
 const { formatBrl, formatSignedBrl, formatEstimatedPrice, currency } = usePositionMoney();

  const current = summary.current;
  const step = summary.monthStep;
  const applied = summary.appliedBrl ?? null;
  const gain = costReturn?.gainBrl ?? summary.gainBrl ?? null;
  const denominator = costReturn?.contributionsBrl ?? applied;
  const gainPercent = gain !== null && denominator ? (gain / denominator) * 100 : null;
  const average = summary.averagePriceBrl;
  const absent = !current
    ? summary.state === "before" && firstEver
      ? `Opens in ${monthLabel(firstEver)}`
      : `No position in ${selectedLabel}`
    : null;
  const liquidatedOn = current?.liquidated ? `Liquidated on ${formatDayKey(current.liquidatedOn)}` : null;

  return (
    <section aria-label="Position metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        label={atCost ? "Carrying Value at Cost" : "Position Value"}
        testId="position-value"
        valueText={current ? formatBrl(current.valueBrl) : "—"}
        icon={<CoinsIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          current ? (
            <NumberFlow
              value={current.valueBrl}
              format={{ style: "currency", currency, maximumFractionDigits: 2 }}
              locales="en-GB"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        detail={
          absent ??
          liquidatedOn ??
          (quoted ? formatQuantity(current!.quantity, quoteSymbol, ticker) : `${currency} balance`)
        }
      />


      <KpiCard
        label="Invested Amount"
        testId="position-applied"
        valueText={current && applied !== null ? formatBrl(applied) : "—"}
        icon={<HandCoinsIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          current && applied !== null ? (
            <NumberFlow value={applied} format={{ style: "currency", currency, maximumFractionDigits: 2 }} locales="en-GB" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        detail={
          absent ??
          (quoted && average !== null ? (
            <span data-testid="position-average-price" title={approximateCost ? "Converted using monthly exchange rates where dated execution FX is unavailable." : averagePriceLabel(summary.costSource, dollarBalance)}>
              {dollarBalance ? "Average Exchange Rate" : "Average Purchase Price"} {formatEstimatedPrice(average)}
            </span>
          ) : firstEver ? (
            `Since ${monthLabel(firstEver)}`
          ) : (
            "—"
          ))
        }
      />

      <KpiCard
        label="Return"
        testId="position-gain"
        valueText={current && gain !== null ? formatSignedBrl(gain) : "—"}
        icon={
          gain !== null && gain < 0 ? (
            <TrendDownIcon aria-hidden="true" size={18} weight="duotone" />
          ) : (
            <TrendUpIcon aria-hidden="true" size={18} weight="duotone" />
          )
        }
        tone={!current || gain === null ? "neutral" : gain >= 0 ? "up" : "down"}
        value={current && gain !== null ? <span>{formatSignedBrl(gain)}</span> : <span className="text-muted-foreground">—</span>}
        detail={
          absent ??
          (gainPercent !== null
            ? `${signedPercent.format(gainPercent / 100)} on invested capital`
            : current?.liquidated
              ? "Realized on withdrawal"
              : "—")
        }
      />

      <ChangeKpiCard
        label="Monthly Return"
        testId="position-month-change"
        changeBrl={step?.changeBrl ?? null}
        changePercent={step?.changePercent ?? null}
        detailSuffix={step?.acrossMissing ? `since ${monthLabel(step.fromMonth)}` : undefined}
        emptyDetail={monthChangeEmpty(summary, selectedLabel)}
        footer={<MonthHighlights summary={summary} quoted={quoted} />}
      />

      <KpiCard
        label="Portfolio Weight"
        testId="position-share"
        valueText={current ? sharePercent.format(current.share / 100) : "—"}
        icon={<ChartPieSliceIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          current ? (
            <NumberFlow
              value={current.share / 100}
              format={{ style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }}
              locales="en-GB"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        detail={
          summary.shareChange !== null && summary.previousMonth
            ? `${summary.shareChange > 0 ? "Up from" : summary.shareChange < 0 ? "Down from" : "Unchanged from"} ${sharePercent.format((current!.share - summary.shareChange) / 100)} in ${monthLabel(summary.previousMonth)}`
            : current
              ? `From ${formatBrl(current.portfolioTotalBrl)} in the portfolio`
              : `No position in ${selectedLabel}`
        }
      />
    </section>
  );
}


function averagePriceLabel(costSource: PositionSummary["costSource"], dollarBalance: boolean) {
  const subject = dollarBalance ? "Average Exchange Rate" : "Average Purchase Price";
  return costSource === "known" ? `${subject} at purchase` : costSource === "opening" ? `${subject} with opening balance` : `${subject} (estimated)`;
}

function PriceHistoryNotice({ state }: { state: PositionHistoryView["history"] }) {
  if (state?.state === "pending") {
    return (
      <p data-testid="price-history-pending" className="mt-2 text-[11px] text-primary">Preparing quote history for this asset. It will appear after the next automatic update, usually within an hour.
      </p>
    );
  }

  if (state?.state === "failed") {
    return (
      <p data-testid="price-history-pending" className="mt-2 text-[11px] text-destructive">Quote history has not loaded yet ({state.error}). Automatic updates retry once per day.
      </p>
    );
  }

  return null;
}

function BackLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Back to Positions"
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold tracking-[0.16em] text-primary uppercase outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <ArrowLeftIcon
        aria-hidden="true"
        size={12}
        weight="bold"
        className="transition-transform duration-150 group-hover:-translate-x-0.5"
      />Positions
    </Link>
  );
}

function monthChangeEmpty(summary: PositionSummary, selectedLabel: string) {
  if (summary.state !== "present") {
    return `No position in ${selectedLabel}`;
  }

  if (!summary.previousMonth) {
    return "First reporting month in history";
  }

  if (!summary.previousPresent) {
    return `Opened in ${selectedLabel}; no position in ${monthLabel(summary.previousMonth)}`;
  }

  return "No comparison";
}

function firstPresent(slots: HistorySlot[]) {
  return (slots.find((slot) => slot.kind === "present") as PresentSlot | undefined) ?? null;
}

function lastPresentUpTo(slots: HistorySlot[], month: string) {
  const candidates = slots.filter((slot): slot is PresentSlot => slot.kind === "present" && slot.month <= month);
  return candidates.at(-1) ?? null;
}




function formatDayKey(day: string | null) {
  return day ? day.split("-").reverse().join("/") : "—";
}
