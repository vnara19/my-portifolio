"use client";

/** Investment table and responsive filters. Keep grouping keys stable while translating built-in category labels. */

import { englishLabel } from "@/lib/english-labels";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretRightIcon,
  CopyIcon,
  CurrencyCircleDollarIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TableIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";

import {
  cloneLatestMonthAction,
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
  allocationLabel,
  classesOf,
  typeOf,
  filterOptions,
  filterPositions,
  groupPositions,
  hasClassFilter,
  matchedValueBrl,
  strategyOf,
  type PositionFilters,
} from "@/modules/portfolio/presentation/position-filters";
import {
  formatBrl,
  formatMonthCompact,
  formatPriceBrl,
  formatSharePercent,
} from "@/modules/portfolio/presentation/portfolio-format";
import { positionHref } from "@/modules/portfolio/presentation/position-page";
import { parseMonthParam, toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";
import { EditToast, takeHandedOffToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { EmptyPortfolio } from "@/modules/portfolio/ui/empty-portfolio";
import { MaturityBadge } from "@/modules/portfolio/ui/maturity-badge";
import { MultiSelectFilter } from "@/modules/portfolio/ui/multi-select-filter";
import { PositionsFilterSheet, type FilterGroup } from "@/modules/portfolio/ui/positions-filter-sheet";
import { PositionFormDialog, type PositionFormTarget } from "@/modules/portfolio/ui/position-form-dialog";

const QUICK_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"];
const GROUP_OPTIONS = ["instituicao", "classe", "tipo"] as const;
const GROUP_LABELS: Record<(typeof GROUP_OPTIONS)[number], string> = {
  instituicao: "Institution",
  classe: "Class",
  tipo: "Type",
};
const list = parseAsArrayOf(parseAsString).withDefault([]);

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, MonthPosition>();

type ColumnMeta = { align: "left" | "right"; calculated: boolean; hide: string };


const COLUMN_META: Record<string, ColumnMeta> = {
  assetName: { align: "left", calculated: false, hide: "" },
  institutionName: { align: "left", calculated: false, hide: "hidden sm:table-cell" },

  assetType: { align: "left", calculated: false, hide: "hidden 2xl:table-cell" },
  strategy: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  classes: { align: "left", calculated: false, hide: "hidden lg:table-cell" },
  maturityDate: { align: "left", calculated: false, hide: "hidden xl:table-cell" },
  quantity: { align: "right", calculated: false, hide: "hidden md:table-cell" },
  totalBrl: { align: "right", calculated: true, hide: "" },
  totalUsd: { align: "right", calculated: true, hide: "hidden xl:table-cell" },
  share: { align: "right", calculated: true, hide: "hidden md:table-cell" },
};

const columns = helper.columns([
  helper.accessor("assetName", { header: "Asset" }),
  helper.accessor("institutionName", { header: "Institution" }),
  helper.accessor((row) => typeOf(row), { id: "assetType", header: "Type" }),
  helper.accessor((row) => strategyOf(row), { id: "strategy", header: "Strategy" }),
  helper.accessor((row) => classesOf(row).join(", "), { id: "classes", header: "Classes" }),

  helper.accessor((row) => row.maturityDate ?? undefined, {
    id: "maturityDate",
    header: "Maturity",
    sortUndefined: "last",
  }),
  helper.accessor("quantity", { header: "Quantity" }),
  helper.accessor("totalBrl", { header: "Total BRL" }),
  helper.accessor((row) => row.totalUsd ?? -1, { id: "totalUsd", header: "Total USD" }),
  helper.accessor("share", { header: "%" }),
]);


const COLUMN_COUNT = columns.length + 1;

type FormState = { open: boolean; target: PositionFormTarget | null; key: number };

export function PositionsWorkspace({
  month,
  catalog,
}: {
  month: MonthPositions | null;
  catalog: EditingCatalog;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useQueryStates(
    {
      classe: list,
      subclasse: list,
      tipo: list,
      inst: list,
      estrategia: list,
      moeda: list,
      venc: list,
      liq: list,
      q: parseAsString.withDefault(""),
      ordem: parseAsString.withDefault("totalBrl.desc"),
      agrupar: parseAsStringLiteral(GROUP_OPTIONS),
    },
    { clearOnDefault: true },
  );

  const [form, setForm] = useState<FormState>({ open: false, target: null, key: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isSaving, startSaving] = useTransition();
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
    subclasses: query.subclasse,
    types: query.tipo,
    institutions: query.inst,
    strategies: query.estrategia,
    currencies: query.moeda,
    maturities: query.venc,
    liquidities: query.liq,
    search: query.q,
  };
  const positions = month?.positions ?? [];
  const filtered = filterPositions(positions, filters);


  const options = filterOptions(positions, filters);
  const sorting = parseSorting(query.ordem);

  const table = useTable({
    features,
    columns,
    data: filtered,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      void setQuery({ ordem: first ? `${first.id}.${first.desc ? "desc" : "asc"}` : null });
    },
  });

  if (!month || month.positions.length === 0) {
    return (
      <>
        <EmptyPositions month={month} catalog={catalog} />
        <EditToast toast={toast} onDismiss={dismissToast} onUndo={undo} undoing={isUndoing} />
      </>
    );
  }

  const canEdit = !month.isLocked;
  const monthLabel = formatMonthCompact(month.referenceDate);
  const sortedPositions = table.getRowModel().rows.map((row) => row.original);
  const groups = query.agrupar ? groupPositions(sortedPositions, query.agrupar, filters) : null;
  const filteredTotal = sortedPositions.reduce((total, position) => total + position.totalBrl, 0);
  const matchedTotal = hasClassFilter(filters)
    ? sortedPositions.reduce((total, position) => total + matchedValueBrl(position, filters), 0)
    : null;
  const activeFilterCount =
    filters.classes.length +
    filters.subclasses.length +
    filters.types.length +
    filters.institutions.length +
    filters.strategies.length +
    filters.currencies.length +
    filters.maturities.length +
    filters.liquidities.length +
    (filters.search ? 1 : 0);
  const occupied = new Set(month.positions.map((position) => `${position.accountId}:${position.assetId}`));
  const liquidatedCount = month.positions.filter((position) => position.liquidated).length;
  const filterGroups: FilterGroup[] = [
    { key: "classe", label: "Class", options: options.classes, selected: filters.classes, onChange: (next) => void setQuery({ classe: next }) },
    { key: "subclasse", label: "Subclass", options: options.subclasses, selected: filters.subclasses, onChange: (next) => void setQuery({ subclasse: next }) },
    { key: "tipo", label: "Type", options: options.types, selected: filters.types, onChange: (next) => void setQuery({ tipo: next }) },
    { key: "inst", label: "Institution", options: options.institutions, selected: filters.institutions, onChange: (next) => void setQuery({ inst: next }) },
    { key: "estrategia", label: "Strategy", options: options.strategies, selected: filters.strategies, onChange: (next) => void setQuery({ estrategia: next }) },
    { key: "moeda", label: "Currency", options: options.currencies, selected: filters.currencies, onChange: (next) => void setQuery({ moeda: next }) },
    { key: "venc", label: "Maturity", options: options.maturities, selected: filters.maturities, onChange: (next) => void setQuery({ venc: next }) },
    { key: "liq", label: "Liquidity", options: options.liquidities, selected: filters.liquidities, onChange: (next) => void setQuery({ liq: next }) },
  ];
  const activeCount = month.positions.length - liquidatedCount;

  const openForm = (target: PositionFormTarget) =>
    setForm((current) => ({ open: true, target, key: current.key + 1 }));

  const cloneMonth = () =>
    startSaving(async () => {
      const result = await cloneLatestMonthAction();
      notify(result);

      if (result.ok && result.month) {
        router.push(`/posicoes?mes=${result.month}`);
      }
    });

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
    void setQuery({ classe: null, subclasse: null, tipo: null, inst: null, estrategia: null, moeda: null, venc: null, liq: null, q: null });


  const openPosition = (position: MonthPosition, href: string) => {
    setOpeningId(position.id);
    startOpening(() => router.push(href));
  };

  const renderRow = (position: MonthPosition, rowKey: string, valueBrl: number) => (
    <PositionRow
      key={rowKey}
      position={position}
      referenceDay={month.referenceDay}
      valueBrl={valueBrl}
      usdRate={month.usdRate}
      href={positionHref(position.accountId, position.assetId, searchParams)}
      expanded={expanded.has(position.id)}
      opening={isOpening && openingId === position.id}
      onOpen={openPosition}
      onToggle={toggleExpanded}
    />
  );

  const cloneTarget = parseMonthParam(catalog.clone.targetMonth ?? undefined);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-24 sm:px-7 sm:py-10 xl:px-12 xl:py-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Positions</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Monthly portfolio</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground" data-testid="positions-count">
            {activeCount} {activeCount === 1 ? "position" : "positions"}
            {liquidatedCount > 0 ? ` · ${liquidatedCount} ${liquidatedCount === 1 ? "liquidated" : "liquidated"}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="font-mono text-xs text-muted-foreground">
            {formatBrl(month.totalBrl)}
            {month.usdRate ? ` · US$ ${formatUsd(month.totalBrl / month.usdRate)}` : ""}
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
            {month.isLatest && catalog.clone.allowed && cloneTarget ? (
              <button type="button" disabled={isSaving} onClick={cloneMonth} className={headerPrimaryButtonClass}>
                <CopyIcon aria-hidden="true" size={14} weight="bold" />Create {formatMonthCompact(cloneTarget)}starting from {monthLabel}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {month.isLocked ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
          <LockKeyIcon aria-hidden="true" className="text-muted-foreground" size={16} weight="duotone" />
          <p data-testid="month-locked" className="text-xs text-muted-foreground">
            {monthLabel}is closed. Open the month using the timeline lock button to edit.
          </p>
        </div>
      ) : null}


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
            grouping={{
              value: query.agrupar,
              options: [{ value: null, label: "None" }, ...GROUP_OPTIONS.map((option) => ({ value: option, label: GROUP_LABELS[option] }))],
              onChange: (value) => void setQuery({ agrupar: value as (typeof GROUP_OPTIONS)[number] | null }),
            }}
            resultCount={sortedPositions.length}
            onClear={clearFilters}
          />

          <div className="hidden sm:contents">
            <MultiSelectFilter label="Class" options={options.classes} selected={filters.classes} onChange={(next) => void setQuery({ classe: next })} />
            <MultiSelectFilter label="Subclass" options={options.subclasses} selected={filters.subclasses} onChange={(next) => void setQuery({ subclasse: next })} />
            <MultiSelectFilter label="Type" options={options.types} selected={filters.types} onChange={(next) => void setQuery({ tipo: next })} />
            <MultiSelectFilter label="Institution" options={options.institutions} selected={filters.institutions} onChange={(next) => void setQuery({ inst: next })} />
            <MultiSelectFilter label="Strategy" options={options.strategies} selected={filters.strategies} onChange={(next) => void setQuery({ estrategia: next })} />
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

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
                <span className="px-2 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Group by</span>
                {([null, ...GROUP_OPTIONS] as const).map((option) => (
                  <button
                    key={option ?? "none"}
                    type="button"
                    aria-pressed={query.agrupar === option}
                    onClick={() => void setQuery({ agrupar: option })}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                      query.agrupar === option
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option === null ? "None" : GROUP_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="premium-panel mt-5 overflow-hidden rounded-[24px]" aria-label="Positions for the reporting month">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase"
                >
                  <th className="w-9 py-3 pr-0 pl-3 sm:pl-4">
                    <span className="sr-only">Expand</span>
                  </th>
                  {headerGroup.headers.map((header) => {
                    const meta = COLUMN_META[header.column.id];
                    const sorted = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={cn("px-4 py-3", meta.hide)}
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 uppercase outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                            meta.align === "right" && "w-full justify-end",
                            sorted && "text-foreground",
                          )}
                        >
                          {meta.calculated ? (
                            <span title="Calculated" className="font-mono normal-case text-muted-foreground/60">
                              ƒ
                            </span>
                          ) : null}
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon aria-hidden="true" size={10} weight="bold" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon aria-hidden="true" size={10} weight="bold" />
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/55">
              {sortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-6 py-10 text-center text-sm text-muted-foreground">No positions match the filters.
                  </td>
                </tr>
              ) : groups ? (
                groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-white/[0.02]">
                      <td colSpan={COLUMN_COUNT} className="px-5 py-2.5 sm:px-6">
                        <div className="flex items-center gap-2.5">
                          {query.agrupar === "classe" ? (
                            <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(group.label) }} />
                          ) : null}
                          <span className="text-xs font-semibold text-foreground">{englishLabel(group.label)}</span>
                          <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
                          <span className="ml-auto font-mono text-xs text-foreground">{formatBrl(group.totalBrl)}</span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map((item) => renderRow(item.position, `${group.key}-${item.position.id}`, item.valueBrl))}
                  </Fragment>
                ))
              ) : (
                sortedPositions.map((position) => renderRow(position, position.id, position.totalBrl))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 text-xs">
                <td colSpan={COLUMN_COUNT} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-muted-foreground">
                      {sortedPositions.length} of {month.positions.length} positions
                    </span>
                    <FooterValue label="Filtered total" value={formatBrl(filteredTotal)} />
                    {month.usdRate ? (
                      <FooterValue label="In USD" value={`US$ ${formatUsd(filteredTotal / month.usdRate)}`} />
                    ) : null}
                    <FooterValue
                      label="Portfolio share"
                      value={formatSharePercent(month.totalBrl === 0 ? 0 : (filteredTotal / month.totalBrl) * 100)}
                    />
                    {matchedTotal !== null ? (
                      <FooterValue label="Share in selected classes" value={formatBrl(matchedTotal)} emphasis />
                    ) : null}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

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
  referenceDay,
  valueBrl,
  usdRate,
  href,
  expanded,
  opening,
  onOpen,
  onToggle,
}: {
  position: MonthPosition;
  referenceDay: string;
  valueBrl: number;
  usdRate: number | null;
  href: string;
  expanded: boolean;
  opening: boolean;
  onOpen: (position: MonthPosition, href: string) => void;
  onToggle: (position: MonthPosition) => void;
}) {
  const isPartial = Math.abs(valueBrl - position.totalBrl) > 0.005;
  const [first, ...others] = [...position.allocations].sort((left, right) => right.weight - left.weight);
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
            {position.assetName}
          </Link>
          {position.fixedIncomeEstimate ? <span className="ml-2 text-[10px] text-muted-foreground">IPCA estimate</span> : null}
          {position.liquidated ? (
            <span
              data-testid="position-liquidated"
              className="ml-2 inline-flex items-center rounded-full border border-border px-1.5 py-px align-middle text-[9px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
            >Liquidated
            </span>
          ) : null}
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">
            {position.ticker ?? "BALANCE"}
            <span className="font-sans 2xl:hidden"> · {typeOf(position)}</span>
          </p>
          {position.maturityDate ? (
            <MaturityBadge maturityDate={position.maturityDate} referenceDay={referenceDay} className="mt-1.5 xl:hidden" />
          ) : null}
          <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">{position.institutionName}</p>
        </Cell>
        <Cell id="institutionName">
          <p className="text-xs text-foreground/80">{position.institutionName}</p>
        </Cell>
        <Cell id="assetType">
          <span className="text-xs whitespace-nowrap text-foreground/80" data-testid="position-type">{typeOf(position)}</span>
        </Cell>
        <Cell id="strategy">
          <span className="text-xs whitespace-nowrap text-foreground/80">{strategyOf(position)}</span>
        </Cell>
        <Cell id="classes">
          {first ? (
            <div className="flex max-w-[300px] items-center gap-1.5" data-testid="position-classes">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(first.assetClass) }} />
              <span className="truncate text-xs text-foreground/80" title={allocationLabel(first)}>
                {allocationLabel(first)}
                {others.length > 0 ? (
                  <span className="text-muted-foreground"> {formatWeightPercent(first.weight)}</span>
                ) : null}
              </span>
              {others.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onToggle(position)}
                  aria-label={`View the ${others.length + 1} classifications for ${position.assetName}`}
                  title={`More ${others.length} ${others.length === 1 ? "classification" : "classifications"}`}
                  className="shrink-0 rounded-md bg-white/[0.05] px-1.5 font-mono text-[10px] leading-4 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  …+{others.length}
                </button>
              ) : null}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </Cell>
        <Cell id="maturityDate">
          {position.maturityDate ? (
            <>
              <p className="font-mono text-xs text-foreground/80">{formatDay(parseDay(position.maturityDate))}</p>
              <MaturityBadge maturityDate={position.maturityDate} referenceDay={referenceDay} className="mt-1" />
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </Cell>
        <Cell id="quantity">
          <QuantityText position={position} />
        </Cell>
        <Cell id="totalBrl">
          <span className="font-mono text-xs font-medium whitespace-nowrap text-foreground sm:text-sm">
            {formatBrl(valueBrl)}
          </span>
          {isPartial ? (
            <p className="mt-0.5 font-mono text-[9px] whitespace-nowrap text-muted-foreground">
              of {formatBrl(position.totalBrl)}
            </p>
          ) : null}
        </Cell>
        <Cell id="totalUsd">
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {position.totalUsd === null ? "—" : `US$ ${formatUsd(position.totalUsd)}`}
          </span>
        </Cell>
        <Cell id="share">
          <span className="font-mono text-xs text-muted-foreground">{formatSharePercent(position.share)}</span>
        </Cell>
      </tr>
      {expanded ? (
        <tr id={detailsId} data-testid="position-details" className="bg-white/[0.012]">
          <td colSpan={COLUMN_COUNT} className="px-5 pt-1 pb-5 sm:pl-[3.25rem] sm:pr-6">
            <PositionDetails position={position} usdRate={usdRate} referenceDay={referenceDay} />
          </td>
        </tr>
      ) : null}
    </>
  );
}


function PositionDetails({
  position,
  usdRate,
  referenceDay,
}: {
  position: MonthPosition;
  usdRate: number | null;
  referenceDay: string;
}) {
  const allocations = [...position.allocations].sort((left, right) => right.weight - left.weight);
  const details: { label: string; value: ReactNode }[] = [
    { label: "Institution", value: position.institutionName },
    { label: "Strategy", value: strategyOf(position) },
    { label: "Currency", value: <span className="font-mono">{position.baseCurrency}</span> },
    {
      label: "Quote",
      value: (
        <span className="font-mono">{position.unitPriceBrl === null ? "Balance, without a quote" : formatPriceBrl(position.unitPriceBrl)}</span>
      ),
    },
    { label: "Quantity", value: <QuantityText position={position} /> },
    { label: "Liquidity", value: position.liquidity ?? "Not specified" },
    {
      label: "Maturity",
      value: position.maturityDate ? (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono">{formatDay(parseDay(position.maturityDate))}</span>
          <MaturityBadge maturityDate={position.maturityDate} referenceDay={referenceDay} />
        </span>
      ) : (
        "Not specified"
      ),
    },
    {
      label: "Total in USD",
      value: <span className="font-mono">{usdRate ? `US$ ${formatUsd(position.totalBrl / usdRate)}` : "—"}</span>,
    },
  ];

  return (
    <div className="grid gap-5 rounded-2xl border border-border/60 bg-background/30 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <p className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">Allocation</p>
        {allocations.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No allocation.</p>
        ) : (
          <ul className="mt-2.5 space-y-2" data-testid="position-details-allocations">
            {allocations.map((allocation) => (
              <li key={allocationLabel(allocation)} className="flex items-center gap-2.5 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(allocation.assetClass) }} />
                <span className="min-w-0 truncate text-foreground/85">{allocationLabel(allocation)}</span>
                <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                  {formatWeightPercent(allocation.weight)}
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-foreground/80">
                  {formatBrl((position.totalBrl * allocation.weight) / 100)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
        {details.map((detail) => (
          <div key={detail.label} className="min-w-0">
            <dt className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(detail.label)}</dt>
            <dd className="mt-1 truncate text-foreground/85">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuantityText({ position }: { position: MonthPosition }) {
  return (
    <span className="font-mono text-xs text-foreground/85">
      {position.quoteSymbol
        ? position.quantity.toLocaleString("en-GB", { maximumFractionDigits: 8 })
        : formatBrl(position.quantity)}
    </span>
  );
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

  return id && COLUMN_META[id] ? [{ id, desc: direction !== "asc" }] : [{ id: "totalBrl", desc: true }];
}

function formatUsd(value: number) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWeightPercent(weight: number) {
  return `${weight.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
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
