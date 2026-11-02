"use client";
import { VIEW_COLUMNS, POSITION_COLUMNS, DEFAULT_POSITION_COLUMNS, holdingCellText, type HoldingColumn, type HoldingView } from "./holding-table-columns";
import type { HoldingAnalytics } from "../application/get-holdings-analytics";
import { SavingsMovementButton } from "./savings-movement-dialog";
import { PortfolioLedgerPanel } from "./portfolio-ledger";
import type { PortfolioLedger } from "../application/get-portfolio-ledger";
import { positionTitle, showPositionTicker } from "../presentation/position-display";

import { nativeUnitPrice } from "../presentation/position-display";

/** Investment table and responsive filters. Sort columns and filter using the classifications stored by the position form. */

import { liquidityLabel } from "@/lib/liquidity-labels";
import { englishLabel } from "@/lib/english-labels";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
  CaretRightIcon,
  CurrencyCircleDollarIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TableIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { SortingState } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";

import {
  startPortfolioAction,
  undoChangeAction,
  type EditActionResult,
} from "@/app/actions/edit-month";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatDay } from "@/modules/portfolio/presentation/maturity";
import {
  primaryClassOf,
  typeOf,
  marketOf,
  normalizeTypeFilter,
  filterOptions,
  filterPositions,
  type PositionFilters,
} from "@/modules/portfolio/presentation/position-filters";
import {
  formatCurrency,
  formatMonthCompact,
  formatUnitPrice,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";
import { positionHref } from "@/modules/portfolio/presentation/position-page";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, takeHandedOffToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { EmptyPortfolio } from "@/modules/portfolio/ui/empty-portfolio";
import { MultiSelectFilter } from "@/modules/portfolio/ui/multi-select-filter";
import { PositionsFilterSheet, type FilterGroup } from "@/modules/portfolio/ui/positions-filter-sheet";
import { PositionFormDialog, type PositionFormTarget } from "@/modules/portfolio/ui/position-form-dialog";

const QUICK_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"];
const list = parseAsArrayOf(parseAsString).withDefault([]);

type ColumnMeta = { align: "left" | "right"; calculated: boolean; hide: string };


const COLUMN_META: Record<string, ColumnMeta> = {
  assetName: { align: "left", calculated: false, hide: "" },

  maturityDate: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  quantity: { align: "right", calculated: false, hide: "hidden md:table-cell" },
  totalBrl: { align: "right", calculated: true, hide: "" },
  share: { align: "right", calculated: true, hide: "hidden md:table-cell" },
};

type FormState = { open: boolean; target: PositionFormTarget | null; key: number };

export function PositionsWorkspace({
  month,
  catalog,
  ledger,
  analytics = {},
}: {
  month: MonthPositions | null;
  catalog: EditingCatalog;
  ledger?: PortfolioLedger | null;
  analytics?: Record<string,HoldingAnalytics>;
}) {
  const [view,setView]=useState<HoldingView>("position");
  const [displaySold,setDisplaySold]=useState(false);
  const [visibleColumns,setVisibleColumns]=useState<string[]>(DEFAULT_POSITION_COLUMNS);
  const shownColumns=view==="position"?POSITION_COLUMNS.filter(column=>visibleColumns.includes(column.id)):VIEW_COLUMNS[view];
  const columnCount=shownColumns.length+2;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useQueryStates(
    {
      classe: list,
      subclasse: list,
      mercado: list,
      tipo: list,
      moeda: list,
      venc: list,
      liq: list,
      q: parseAsString.withDefault(""),
      ordem: parseAsString.withDefault("totalBrl.desc"),
    },
    { clearOnDefault: true },
  );

  const [form, setForm] = useState<FormState>({ open: false, target: null, key: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isUndoing, startUndo] = useTransition();
  const [isOpening, startOpening] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const sequence = useRef(0);

  const dismissToast = useCallback(() => setToast(null), []);

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

      if (result.ok && !result.month) {
        router.replace("/posicoes");
      }
    });


  useEffect(() => {
    const handed = takeHandedOffToast();

    if (handed) {
      setToast({ id: ++sequence.current, ...handed });
    }
  }, []);

  const filters: PositionFilters = {
    classes: query.classe,
    subclasses: [],
    markets: query.mercado,
    types: query.tipo.map(normalizeTypeFilter).filter(Boolean),
    currencies: query.moeda.map((currency) => ["BTC", "Altcoins"].includes(currency) ? "USD" : currency),
    maturities: query.venc,
    liquidities: [...new Set(query.liq.map(liquidityLabel))],
    search: query.q,
  };
  const positions = (month?.positions ?? []).filter((position) => displaySold || !position.liquidated);
  const filtered = filterPositions(positions, filters);


  const options = filterOptions(positions, filters);
  const sorting = parseSorting(query.ordem);

  if (!month || month.positions.length === 0) {
    return (
      <>
        <EmptyPositions month={month} catalog={catalog} />
        {ledger && month ? <div className="mx-auto w-full max-w-[1472px] px-5 pb-24 sm:px-7 xl:px-12"><PortfolioLedgerPanel ledger={ledger} selectedMonth={toMonthParam(month.referenceDate)} /></div> : null}
        <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
      </>
    );
  }

  const canEdit = !month.isLocked;
  const monthLabel = formatMonthCompact(month.referenceDate);
  const sort=sorting[0];
  const sortedPositions = [...filtered].sort((a,b)=>{
    const column=[...POSITION_COLUMNS,...VIEW_COLUMNS.price,...VIEW_COLUMNS.performance,...VIEW_COLUMNS.risk].find(c=>c.id===sort?.id);
    const left=sort?.id==='assetName'?positionTitle(a.assetName,a.ticker):sort?.id==='totalBrl'?a.totalBrl:column?.get(a,analytics[a.id]);
    const right=sort?.id==='assetName'?positionTitle(b.assetName,b.ticker):sort?.id==='totalBrl'?b.totalBrl:column?.get(b,analytics[b.id]);
    if(left==null)return right==null?0:1;if(right==null)return -1;
    return (typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right)))*(sort?.desc?-1:1);
  });
  const filteredTotal = sortedPositions.reduce((total, position) => total + position.totalBrl, 0);
  const activeFilterCount =
    filters.classes.length +
    (filters.markets?.length ?? 0) +
    filters.types.length +
    filters.currencies.length +
    filters.maturities.length +
    filters.liquidities.length +
    (filters.search ? 1 : 0);
  const occupied = new Set(month.positions.filter(position=>!position.historicalSold).map((position) => `${position.accountId}:${position.assetId}`));
  const liquidatedCount = month.positions.filter((position) => position.liquidated).length;
  const filterGroups: FilterGroup[] = [
    { key: "tipo", label: "Asset Type", options: options.types, selected: filters.types, onChange: (next) => void setQuery({ tipo: next }) },
    { key: "mercado", label: "Market", options: options.markets, selected: filters.markets ?? [], onChange: (next) => void setQuery({ mercado: next }) },
    { key: "moeda", label: "Currency", options: options.currencies, selected: filters.currencies, onChange: (next) => void setQuery({ moeda: next }) },
    { key: "venc", label: "Maturity", options: options.maturities, selected: filters.maturities, onChange: (next) => void setQuery({ venc: next }) },
    { key: "liq", label: "Liquidity", options: options.liquidities, selected: filters.liquidities, onChange: (next) => void setQuery({ liq: next }) },
  ];
  const activeCount = month.positions.length - liquidatedCount;

  const openForm = (target: PositionFormTarget) =>
    setForm((current) => ({ open: true, target, key: current.key + 1 }));

  const toggleExpanded = (position: MonthPosition) =>
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(position.id)) {
        next.delete(position.id);
      } else {
        next.add(position.id);
      }

      return next;
    });

  const toggleQuickClass = (assetClass: string) =>
    void setQuery({
      classe: filters.classes.includes(assetClass)
        ? filters.classes.filter((value) => value !== assetClass)
        : [...filters.classes, assetClass],
    });

  const clearFilters = () =>
    void setQuery({ classe: null, subclasse: null, mercado: null, tipo: null, moeda: null, venc: null, liq: null, q: null });


  const openPosition = (position: MonthPosition, href: string) => {
    setOpeningId(position.id);
    startOpening(() => router.push(href));
  };

  const renderRow = (position: MonthPosition, rowKey: string) => (
    <PositionRow
      key={rowKey}
      position={position}
      href={positionHref(position.accountId, position.assetId, searchParams)}
      expanded={expanded.has(position.id)}
      opening={isOpening && openingId === position.id}
      onOpen={openPosition}
      onToggle={toggleExpanded}
      shownColumns={shownColumns}
      analytics={analytics[position.id]}
    />
  );


  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-24 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Positions</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Holdings</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground" data-testid="positions-count">
            {activeCount} {activeCount === 1 ? "Position" : "Positions"}
            {liquidatedCount > 0 ? ` · ${liquidatedCount} ${liquidatedCount === 1 ? "liquidated" : "liquidated"}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="font-mono text-xs text-muted-foreground">
            {portfolioEquivalent(month.totalBrl, "USD", month.usdRate, month.eurRate ?? null)}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">

            <Link
              href={`/posicoes/cotacoes?mes=${toMonthParam(month.referenceDate)}`}
              aria-label="Monthly quotes"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <CurrencyCircleDollarIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />Quotes
            </Link>

            {canEdit ? (
              <button type="button" onClick={() => openForm({ mode: "add" })} className={headerPrimaryButtonClass}>
                <PlusIcon aria-hidden="true" size={14} weight="bold" />Add position
              </button>
            ) : null}

          </div>
        </div>
      </header>




      <section aria-label="Filters" className="mt-6 space-y-3">
        <div className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {QUICK_CLASSES.filter((assetClass) => options.classes.includes(assetClass)).map((assetClass) => {
            const active = filters.classes.includes(assetClass);

            return (
              <button
                key={assetClass}
                type="button"
                aria-pressed={active}
                onClick={() => toggleQuickClass(assetClass)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8",
                  active
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(assetClass) }} />
                {englishLabel(assetClass)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex h-10 min-w-0 flex-1 items-center sm:h-8 sm:min-w-[200px] sm:max-w-[280px]">
            <span className="sr-only">Search positions</span>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 text-muted-foreground sm:left-2.5"
              size={14}
            />
            <input
              type="search"
              value={filters.search}
              onChange={(event) => void setQuery({ q: event.target.value || null })}
              placeholder="Search positions"
              className="h-10 w-full rounded-xl border border-border bg-card/60 pr-2.5 pl-9 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 sm:rounded-lg sm:pl-8"
            />
          </label>

          <PositionsFilterSheet
            className="sm:hidden"
            groups={filterGroups}
            resultCount={sortedPositions.length}
            additionalActiveCount={filters.classes.length}
            onClear={clearFilters}
          />

          <div className="hidden sm:contents">
            <MultiSelectFilter label="Asset Type" options={options.types} selected={filters.types} onChange={(next) => void setQuery({ tipo: next })} />
            <MultiSelectFilter label="Market" options={options.markets} selected={filters.markets ?? []} onChange={(next) => void setQuery({ mercado: next })} />
            <MultiSelectFilter label="Currency" options={options.currencies} selected={filters.currencies} onChange={(next) => void setQuery({ moeda: next })} />
            <MultiSelectFilter label="Maturity" options={options.maturities} selected={filters.maturities} onChange={(next) => void setQuery({ venc: next })} />
            <MultiSelectFilter label="Liquidity" options={options.liquidities} selected={filters.liquidities} onChange={(next) => void setQuery({ liq: next })} />

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <XIcon aria-hidden="true" size={12} weight="bold" />Clear filters
              </button>
            ) : null}


          </div>
        </div>
      </section>

      <section className="premium-panel mt-5 overflow-hidden rounded-[24px]" aria-label="Positions for the reporting month">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div role="tablist" aria-label="Holdings view" className="flex gap-1">{(['position','price','performance','risk'] as const).map(item=><button key={item} type="button" role="tab" aria-selected={view===item} onClick={()=>setView(item)} className={cn("rounded-lg px-3 py-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary",view===item?"bg-primary/15 text-primary":"text-muted-foreground hover:text-foreground")}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>
          <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-xs text-muted-foreground">Display Sold<input type="checkbox" role="switch" checked={displaySold} onChange={e=>setDisplaySold(e.target.checked)} className="accent-primary"/></label>{view==='position'?<details className="relative"><summary className="cursor-pointer rounded-lg border border-border px-3 py-2 text-xs">Columns</summary><fieldset className="absolute right-0 top-full z-30 mt-2 max-h-96 w-64 space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"><legend className="sr-only">Customize Position Columns</legend>{POSITION_COLUMNS.map(column=><label key={column.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={e=>setVisibleColumns(old=>e.target.checked?[...old,column.id]:old.filter(id=>id!==column.id))} className="accent-primary"/>{column.label}</label>)}</fieldset></details>:null}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-semibold text-muted-foreground"><th className="w-9"><span className="sr-only">Expand</span></th>{[{id:'assetName',label:'Asset'},...shownColumns].map(column=><th key={column.id} className={cn("px-4 py-3 whitespace-nowrap",column.id!=='assetName'&&"text-right")} aria-sort={sort?.id===column.id?(sort.desc?'descending':'ascending'):'none'}><button type="button" onClick={()=>void setQuery({ordem:`${column.id}.${sort?.id===column.id&&!sort.desc?'desc':'asc'}`})} className="inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">{column.label}{sort?.id===column.id?(sort.desc?<ArrowDownIcon size={10}/>:<ArrowUpIcon size={10}/>):<ArrowsDownUpIcon size={10} className="opacity-50"/>}</button></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/55">
              {sortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-6 py-10 text-center text-sm text-muted-foreground">No positions match the filters.
                  </td>
                </tr>
              ) : (
                sortedPositions.map((position) => renderRow(position, position.id))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 text-xs">
                <td colSpan={columnCount} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-muted-foreground">
                      {sortedPositions.length} of {positions.length} Positions
                    </span>
                    <FooterValue label="Total USD" value={portfolioEquivalent(filteredTotal, "USD", month.usdRate, month.eurRate ?? null)} />
                    <FooterValue label="Total BRL" value={portfolioEquivalent(filteredTotal, "BRL", month.usdRate, month.eurRate ?? null)} />
                    <FooterValue label="Total EUR" value={portfolioEquivalent(filteredTotal, "EUR", month.usdRate, month.eurRate ?? null)} />
                    <FooterValue label="Portfolio Share" value={formatSharePercent(month.totalBrl === 0 ? 0 : (filteredTotal / month.totalBrl) * 100)} />
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {ledger ? <PortfolioLedgerPanel ledger={ledger} selectedMonth={toMonthParam(month.referenceDate)} /> : null}

      <PositionFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        target={form.target}
        formKey={form.key}
        catalog={catalog}
        month={{
          id: month.id,
          label: monthLabel,
          isCurrent: month.isCurrent,
          quotes: month.quotes,
          referenceDate: month.referenceDate,
        }}
        occupied={occupied}
        onSaved={notify}
      />

      <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
    </div>
  );
}

function PositionRow({
  position,
  href,
  expanded,
  opening,
  onOpen,
  onToggle,
  shownColumns,
  analytics,
}: {
  position: MonthPosition;
  shownColumns: HoldingColumn[];
  analytics?: HoldingAnalytics;
  href: string;
  expanded: boolean;
  opening: boolean;
  onOpen: (position: MonthPosition, href: string) => void;
  onToggle: (position: MonthPosition) => void;
}) {
  const detailsId = `detalhes-${position.id}`;


  const openFromRow = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, [role='combobox']")) {
      return;
    }

    if (window.getSelection()?.toString()) {
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }

    onOpen(position, href);
  };

  return (
    <>
      <tr
        data-testid="position-row"
        onClick={openFromRow}
        aria-busy={opening || undefined}
        className={cn(
          "group cursor-pointer transition-[background-color,opacity] duration-150 hover:bg-white/[0.018]",
          expanded && "bg-white/[0.018]",
          position.liquidated && "text-muted-foreground opacity-60 hover:opacity-90",
          opening && "bg-primary/[0.04] opacity-70",
        )}
      >
        <td className="py-4 pr-0 pl-3 align-top sm:pl-4">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${position.assetName}`}
            onClick={() => onToggle(position)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <CaretRightIcon
              aria-hidden="true"
              size={12}
              weight="bold"
              className={cn("transition-transform duration-200", expanded && "rotate-90")}
            />
          </button>
        </td>
        <Cell id="assetName">
          <Link
            href={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                return;
              }

              event.preventDefault();
              onOpen(position, href);
            }}
            className="rounded-sm text-sm font-medium text-foreground/90 underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <AssetClassDot position={position} className="mr-2 align-middle" />{positionTitle(position.assetName, position.ticker)}
          </Link>
          {position.bondAtCost ? <span className="ml-2 text-[10px] text-muted-foreground">At Cost</span> : null}
          {position.bondValuationDate ? <span className="ml-2 text-[10px] text-muted-foreground">Manual · {position.bondValuationDate}</span> : null}
          {position.fixedIncomeEstimate ? <span className="ml-2 text-[10px] text-muted-foreground">Published IPCA</span> : null}
          {position.liquidated ? (
            <span
              data-testid="position-liquidated"
              className="ml-2 inline-flex items-center rounded-full border border-border px-1.5 py-px align-middle text-[9px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
            >Liquidated
            </span>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-1 font-sans text-[10px] text-muted-foreground">
            {[showPositionTicker(position.assetName, position.ticker) && position.ticker !== position.valueCurrency ? position.ticker : null,
              typeOf(position)?.toLowerCase() !== positionTitle(position.assetName, position.ticker).toLowerCase() ? typeOf(position) || "Review Product Type" : null,
              marketOf(position) !== "Other Markets" ? marketOf(position) : null,
              position.valueCurrency].filter(Boolean).join(" · ")}
          </p>
          {position.maturityDate ? <p className="mt-1.5 font-mono text-[10px] text-muted-foreground xl:hidden">{formatDay(parseDay(position.maturityDate))}</p> : null}
        </Cell>
        {shownColumns.map(column=>{const value=column.get(position,analytics);const signed=['unrealized','unrealizedPercent','daily','dailyPercent','totalGain','totalPercent','change','changePercent','annualized'].includes(column.id)||column.id.startsWith('perf-');return <td key={column.id} title={column.description} className={cn("px-4 py-4 text-right align-top font-mono text-xs whitespace-nowrap",signed&&typeof value==='number'?(value<0?'text-destructive':value>0?'text-primary':'text-muted-foreground'):'text-foreground/85')}>{holdingCellText(column,position,analytics)}</td>;})}
      </tr>
      {expanded ? (
        <tr id={detailsId} data-testid="position-details" className="bg-white/[0.012]">
          <td colSpan={shownColumns.length+2} className="px-5 pt-1 pb-5 sm:pl-[3.25rem] sm:pr-6">
            <PositionDetails position={position} />
            {position.assetType === "savings" ? <div className="mt-4"><SavingsMovementButton assetId={position.assetId} name={position.assetName} /></div> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}


function PositionDetails({
  position,
}: {
  position: MonthPosition;
}) {
  const details: { label: string; value: ReactNode }[] = [
    { label: "Asset Type", value: typeOf(position) || "Review Product Type" },
    { label: "Asset Class", value: <span className="inline-flex items-center gap-2"><AssetClassDot position={position} />{englishLabel(primaryClassOf(position))}</span> },
    { label: "Market", value: marketOf(position) },
    { label: "Currency", value: <span className="font-mono">{position.valueCurrency}</span> },
    ...(position.securityQuantity !== null && position.unitPriceNative != null && !position.bondAtCost ? [{
      label: "Unit Price",
      value: <span className="font-mono">{position.unitPriceNative == null ? "Not Specified" : formatUnitPrice(position.unitPriceNative, position.valueCurrency)}</span>,
    }] : []),
    ...(position.securityQuantity !== null ? [{ label: "Quantity", value: <QuantityText position={position} /> }] : []),
    { label: "Liquidity", value: liquidityLabel(position.liquidity) },
    {
      label: "Maturity",
      value: position.maturityDate ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-mono">{formatDay(parseDay(position.maturityDate))}</span>
        </span>
      ) : (
        "No Maturity Date"
      ),
    },
    {
      label: "Value",
      value: <span className="font-mono">{position.nativeValue === null ? "Not Specified" : formatCurrency(position.nativeValue, position.valueCurrency)}</span>,
    },
  ];

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-background/30 p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs md:grid-cols-3 xl:grid-cols-4">
        {details.map((detail) => (
          <div key={detail.label} className={cn("min-w-0", detail.label === "Unit Price" && "col-span-2 md:col-span-1")}>
            <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(detail.label)}</dt>
            <dd className="mt-1 [overflow-wrap:anywhere] text-foreground/85">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuantityText({ position }: { position: MonthPosition }) {
  if (position.securityQuantity === null) return <span className="text-xs text-muted-foreground">—</span>;
  const unit = position.assetType === "crypto" ? position.ticker : position.assetType === "international-bond" || position.assetType === "treasury" ? "bonds" : "units";
  return <span className="font-mono text-xs text-foreground/85">{Number(position.securityQuantity).toLocaleString("en-GB", { maximumFractionDigits: 8 })}{unit ? ` ${unit}` : ""}</span>;
}

function Cell({ id, children }: { id: string; children: ReactNode }) {
  const meta = COLUMN_META[id];

  return (
    <td
      className={cn(
        "px-4 py-4 align-top",
        meta.align === "right" && "text-right",
        meta.calculated && "bg-white/[0.012]",
        meta.hide,
      )}
    >
      {children}
    </td>
  );
}

function FooterValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(label)}</span>
      <span className={cn("font-mono text-sm", emphasis ? "text-primary" : "text-foreground")}>{value}</span>
    </span>
  );
}

function parseSorting(value: string): SortingState {
  const [id, direction] = value.split(".");

  return id && (id==='assetName'||[...POSITION_COLUMNS,...VIEW_COLUMNS.price,...VIEW_COLUMNS.performance,...VIEW_COLUMNS.risk].some(c=>c.id===id)) ? [{ id, desc: direction !== "asc" }] : [{ id: "totalBrl", desc: true }];
}

function portfolioEquivalent(totalBrl: number, currency: "BRL" | "USD" | "EUR", usdRate: number | null, eurRate: number | null) {
  const value = nativeUnitPrice(totalBrl, currency, usdRate, eurRate);
  return value === null ? `${currency} —` : formatCurrency(value, currency);
}

function AssetClassDot({ position, className }: { position: MonthPosition; className?: string }) {
  const assetClass = primaryClassOf(position);
  return <span aria-hidden="true" title={englishLabel(assetClass)} className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ backgroundColor: categoryColor(assetClass) }} />;
}



function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}


function EmptyPositions({ month, catalog }: { month: MonthPositions | null; catalog: EditingCatalog }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>({ open: false, target: null, key: 0 });
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isStarting, startStarting] = useTransition();


  const [pendingAdd, setPendingAdd] = useState(() => searchParams.get("incluir") === "1");
  const sequence = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const editable = month !== null && !month.isLocked;
  const formOpen = form.open || (pendingAdd && editable);

  const closeForm = () => {
    setForm((current) => ({ ...current, open: false }));
    setPendingAdd(false);

    if (searchParams.get("incluir") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("incluir");
      router.replace(params.size > 0 ? `/posicoes?${params}` : "/posicoes", { scroll: false });
    }
  };

  if (month && month.isLocked) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <TableIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">No positions in this reporting month</h1>
      </div>
    );
  }

  const add = () => {
    if (editable) {
      setForm((current) => ({ open: true, target: { mode: "add" }, key: current.key + 1 }));
      return;
    }

    startStarting(async () => {
      const result = await startPortfolioAction();

      if (!result.ok) {
        setToast({ id: ++sequence.current, tone: "error", message: result.message });
        return;
      }

      setPendingAdd(true);
      router.refresh();
    });
  };

  return (
    <>
      <EmptyPortfolio title="No positions yet" onAdd={add} adding={isStarting || (pendingAdd && !editable)} />
      {month ? (
        <PositionFormDialog
          open={formOpen}
          onOpenChange={(open) => (open ? setForm((current) => ({ ...current, open })) : closeForm())}
          target={form.target ?? { mode: "add" }}
          formKey={form.key}
          catalog={catalog}
          month={{
            id: month.id,
            label: formatMonthCompact(month.referenceDate),
            isCurrent: month.isCurrent,
            quotes: month.quotes,
            referenceDate: month.referenceDate,
          }}
          occupied={new Set()}
          onSaved={(result) =>
            setToast({ id: ++sequence.current, tone: result.ok ? "success" : "error", message: result.message })
          }
        />
      ) : null}
      <EditToast toast={toast} onDismiss={dismissToast} onUndo={() => undefined} undoing={false} />
    </>
  );
}
