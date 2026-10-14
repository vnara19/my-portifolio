"use client";

/** Edit target weights and tolerance bands. Preview calculations are derived; only saving persists the plan. */

import { englishLabel } from "@/lib/english-labels";

import {
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { saveTargetPlanAction } from "@/app/actions/target-plan";
import { setPendingChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
import type { TargetEditorData, TargetEditorItem } from "@/modules/portfolio/application/get-target-editor";
import { deriveCurrencyTargets, withDerivedCurrency } from "@/modules/portfolio/domain/currency-targets";
import {
  buildAllocationGroups,
  MAX_REBALANCE_TOLERANCE,
  type AllocationGroupKey,
  type AllocationRow,
  type TargetValue,
} from "@/modules/portfolio/domain/rebalance";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import {
  formatBrl,
  formatMonthCompact,
  formatSharePercent,
  parseLocaleNumber,
} from "@/modules/portfolio/presentation/portfolio-format";
import { TARGET_SCOPES, targetGroupKey } from "@/modules/portfolio/presentation/target-groups";
import { EditToast, type EditToastState } from "@/modules/portfolio/ui/edit-toast";
import { StepSlider } from "@/modules/portfolio/ui/step-slider";

const SUM_EPSILON = 0.01;
const EMPTY_ROWS: AllocationRow[] = [];

type Draft = Record<string, string>;


export function TargetEditor({ editor, children }: { editor: TargetEditorData; children?: ReactNode }) {
  const [draft, setDraft] = useState<Draft>({});
  const [toleranceDraft, setToleranceDraft] = useState<string | null>(null);
  const [previewScope, setPreviewScope] = useState<AllocationGroupKey>("ASSET_CLASS");
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const sequence = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);


  const derivedCurrency = deriveCurrencyTargets(toTargets(editor.items, draft));
  const valueOf = (item: TargetEditorItem) =>
    item.scope === "CURRENCY" ? (derivedCurrency.get(item.primaryLabel) ?? 0) * 100 : draftValue(item, draft);
  const textOf = (item: TargetEditorItem) => draft[item.key] ?? formatInput(item.percent);

  const changedKeys = editor.items
    .filter((item) => draft[item.key] !== undefined && Math.abs(valueOf(item) - item.percent) > 1e-9)
    .map((item) => item.key);
  const groupSums = new Map<string, number>();
  let hasInvalidValue = false;

  for (const item of editor.items) {
    if (item.scope === "CURRENCY") {
      continue;
    }

    const value = valueOf(item);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      hasInvalidValue = true;
    }
    const group = targetGroupKey(item.scope, item.primaryLabel);
    groupSums.set(group, (groupSums.get(group) ?? 0) + (Number.isFinite(value) ? value : 0));
  }

  const toleranceText = toleranceDraft ?? formatInput(editor.tolerance);
  const toleranceValue = draftTolerance(toleranceDraft, editor.tolerance);
  const toleranceInvalid = !isValidTolerance(toleranceValue);
  const toleranceChanged = toleranceDraft !== null && Math.abs(toleranceValue - editor.tolerance) > 1e-9;
  if (toleranceInvalid) {
    hasInvalidValue = true;
  }

  const pendingCount = changedKeys.length + (toleranceChanged ? 1 : 0);
  const invalidGroups = [...groupSums.values()].filter((sum) => Math.abs(sum - 100) > SUM_EPSILON).length;
  const canSave = pendingCount > 0 && invalidGroups === 0 && !hasInvalidValue && !isSaving;

  useEffect(() => {
    setPendingChanges(pendingCount);
    if (pendingCount === 0) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingCount]);

  useEffect(() => () => setPendingChanges(0), []);


  const setValue = useCallback((item: TargetEditorItem, text: string) => {
    setDraft((current) => ({ ...current, [item.key]: text }));
  }, []);

  const discard = () => {
    setDraft({});
    setToleranceDraft(null);
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveTargetPlanAction({
        targets: editor.items.map((item) => ({
          key: item.key,
          percent: draft[item.key] !== undefined ? draft[item.key].trim() : String(item.percent),
        })),
        tolerance: toleranceDraft !== null ? toleranceDraft.trim() : String(editor.tolerance),
      });
      setToast({ id: ++sequence.current, tone: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        discard();
      }
    });


  const deferredDraft = useDeferredValue(draft);
  const deferredToleranceDraft = useDeferredValue(toleranceDraft);
  const preview = editor.preview;
  const before = useMemo(
    () => (preview ? buildAllocationGroups(preview.aggregates, previewTargets(editor.items, {}), editor.tolerance) : []),
    [preview, editor.items, editor.tolerance],
  );
  const after = useMemo(() => {
    if (!preview) {
      return [];
    }
    const tolerance = draftTolerance(deferredToleranceDraft, editor.tolerance);
    return buildAllocationGroups(
      preview.aggregates,
      previewTargets(editor.items, deferredDraft),
      isValidTolerance(tolerance) ? tolerance : editor.tolerance,
    );
  }, [preview, editor.items, editor.tolerance, deferredDraft, deferredToleranceDraft]);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-32 sm:px-7 sm:py-10 sm:pb-32 xl:px-12 xl:py-12 xl:pb-32">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Settings</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Portfolio targets</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Last changed on <span className="text-foreground">{VERSION_DATE_FORMAT.format(editor.updatedAt)}</span>
          </p>
        </div>
      </header>


      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]">
        <div className="space-y-6">
          <ToleranceCard
            text={toleranceText}
            value={toleranceValue}
            invalid={toleranceInvalid}
            changed={toleranceChanged}
            onChange={setToleranceDraft}
          />

          {TARGET_SCOPES.map(({ scope, title }) => {
            const items = editor.items.filter((item) => item.scope === scope);

            if (items.length === 0) {
              return null;
            }

            return (
              <section key={scope} className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label={title}>
                <h2 className="text-base font-semibold tracking-[-0.025em]">{title}</h2>

                {scope === "CURRENCY" ? (
                  <DerivedCurrencyGroup items={items} valueOf={valueOf} />
                ) : scope === "CLASS_CURRENCY" ? (
                  <div className="mt-5 space-y-6">
                    {[...new Set(items.map((item) => item.primaryLabel))].map((className) => {
                      const classItems = items.filter((item) => item.primaryLabel === className);
                      return (
                        <TargetGroup
                          key={className}
                          heading={className}
                          headingColor={categoryColor(className)}
                          items={classItems}
                          sum={groupSums.get(targetGroupKey(scope, className)) ?? 0}
                          labelOf={(item) => item.secondaryLabel ?? item.primaryLabel}
                          valueOf={valueOf}
                          textOf={textOf}
                          onChange={setValue}
                          changedKeys={changedKeys}
                        />
                      );
                    })}
                  </div>
                ) : scope === "FIXED_INCOME" ? (
                  <FixedIncomeMatrix
                    items={items}
                    sum={groupSums.get(scope) ?? 0}
                    valueOf={valueOf}
                    textOf={textOf}
                    onChange={setValue}
                    changedKeys={changedKeys}
                  />
                ) : (
                  <div className="mt-5">
                    <TargetGroup
                      items={items}
                      sum={groupSums.get(scope) ?? 0}
                      labelOf={(item) => item.primaryLabel}
                      valueOf={valueOf}
                      textOf={textOf}
                      onChange={setValue}
                      changedKeys={changedKeys}
                    />
                  </div>
                )}
              </section>
            );
          })}

          {editor.versions.length > 0 ? (
            <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label="Versions">
              <div className="flex items-center gap-2">
                <ClockCounterClockwiseIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
                <h2 className="text-base font-semibold tracking-[-0.025em]">Versions</h2>
              </div>
              <ol className="mt-4 space-y-2">
                {editor.versions.map((version) => (
                  <li
                    key={version.id}
                    data-version-kind="import"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                  >
                    <DownloadSimpleIcon aria-hidden="true" className="-mx-px text-chart-up" size={12} weight="bold" />
                    <span className="text-foreground">Backup imported</span>
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-muted-foreground">exported on {VERSION_DATE_FORMAT.format(version.exportedAt)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {VERSION_DATE_FORMAT.format(version.importedAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {children}
        </div>


        <aside className="hidden md:block xl:sticky xl:top-[148px] xl:self-start" aria-label="Rebalancing preview">
          <PreviewPanel
            scope={previewScope}
            onScopeChange={setPreviewScope}
            monthLabel={preview ? formatMonthCompact(preview.referenceDate) : null}
            beforeRows={before.find((group) => group.key === previewScope)?.rows ?? EMPTY_ROWS}
            afterRows={after.find((group) => group.key === previewScope)?.rows ?? EMPTY_ROWS}
          />
        </aside>
      </div>

      {pendingCount > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-40 flex justify-center px-4">
          <div
            className={cn(
              "flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl",
              invalidGroups > 0 || hasInvalidValue ? "border-destructive/40" : "border-warning-border",
            )}
          >
            {invalidGroups > 0 || hasInvalidValue ? (
              <WarningCircleIcon aria-hidden="true" className="shrink-0 text-destructive" size={16} weight="fill" />
            ) : (
              <span className="size-2 shrink-0 rounded-full bg-warning-foreground" />
            )}
            <p className="text-xs text-foreground" aria-live="polite">
              {invalidGroups > 0
                ? `${invalidGroups} ${invalidGroups === 1 ? "group does not add up to" : "groups do not add up to"} 100%`
                : hasInvalidValue
                  ? toleranceInvalid
                    ? `Use a tolerance between 0 and ${MAX_REBALANCE_TOLERANCE}`
                    : "Some percentages are invalid"
                  : `${pendingCount} ${pendingCount === 1 ? "change" : "changes"}`}
            </p>
            <button
              type="button"
              onClick={discard}
              disabled={isSaving}
              className="ml-auto h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-40"
            >
              {isSaving ? "Saving…" : "Save targets"}
            </button>
          </div>
        </div>
      ) : null}

      <EditToast toast={toast} onDismiss={dismissToast} onUndo={() => undefined} undoing={false} />
    </div>
  );
}

type GroupProps = {
  items: TargetEditorItem[];
  sum: number;
  valueOf: (item: TargetEditorItem) => number;
  textOf: (item: TargetEditorItem) => string;
  onChange: (item: TargetEditorItem, text: string) => void;
  changedKeys: string[];
};


function DerivedCurrencyGroup({
  items,
  valueOf,
}: {
  items: TargetEditorItem[];
  valueOf: (item: TargetEditorItem) => number;
}) {
  return (
    <div className="mt-5" data-testid="derived-currency">
      <StackedBar
        segments={items.map((item) => ({ key: item.key, label: englishLabel(item.primaryLabel), value: valueOf(item) }))}
      />
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(item.primaryLabel) }} />
              <span className="truncate text-xs text-foreground/85">{englishLabel(item.primaryLabel)}</span>
            </span>
            <span
              aria-label={`Calculated target for ${englishLabel(item.primaryLabel)}`}
              className="pr-2 text-right font-mono text-xs text-foreground tabular-nums"
            >
              {formatInput(Math.round(valueOf(item) * 100) / 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetGroup({
  heading,
  headingColor,
  items,
  sum,
  labelOf,
  valueOf,
  textOf,
  onChange,
  changedKeys,
}: GroupProps & { heading?: string; headingColor?: string; labelOf: (item: TargetEditorItem) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {heading ? (
          <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: headingColor }} />
            {heading}
          </span>
        ) : (
          <span />
        )}
        <SumBadge sum={sum} />
      </div>

      <StackedBar
        segments={items.map((item) => ({ key: item.key, label: labelOf(item), value: valueOf(item) }))}
      />

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <TargetRow
            key={item.key}
            item={item}
            label={labelOf(item)}
            value={valueOf(item)}
            text={textOf(item)}
            changed={changedKeys.includes(item.key)}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}


const TargetRow = memo(function TargetRow({
  item,
  label,
  value,
  text,
  changed,
  onChange,
}: {
  item: TargetEditorItem;
  label: string;
  value: number;
  text: string;
  changed: boolean;
  onChange: (item: TargetEditorItem, text: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_84px] sm:gap-3">
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(label) }} />
        <span className="truncate text-xs text-foreground/85">
          {englishLabel(label)}
        </span>
      </span>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <StepSlider
          value={value}
          max={100}
          label={`Target for ${englishLabel(label)}`}
          valueText={(current) => `${formatInput(current)}%`}
          onChange={(next) => onChange(item, formatInput(next))}
        />
      </div>
      <div className="col-start-2 row-start-1 sm:col-start-3">
        <PercentInput item={item} text={text} changed={changed} label={englishLabel(label)} onChange={onChange} />
      </div>
    </div>
  );
});

function FixedIncomeMatrix({ items, sum, valueOf, textOf, onChange, changedKeys }: GroupProps) {
  const subclasses = [...new Set(items.map((item) => item.primaryLabel))];
  const durations = ["Curto", "Médio", "Longo"].filter((duration) =>
    items.some((item) => item.secondaryLabel === duration),
  );

  return (
    <div className="mt-5">
      <div className="flex justify-end">
        <SumBadge sum={sum} />
      </div>
      <StackedBar
        segments={items.map((item) => ({
          key: item.key,
          label: `${englishLabel(item.primaryLabel)} · ${englishLabel(item.secondaryLabel)}`,
          value: valueOf(item),
        }))}
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left max-sm:block">
          <thead className="max-sm:hidden">
            <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="py-2 pr-3">Subclass</th>
              {durations.map((duration) => (
                <th key={duration} className="px-1.5 py-2 text-right">
                  {englishLabel(duration)}
                </th>
              ))}
              <th className="py-2 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="max-sm:block max-sm:space-y-4">
            {subclasses.map((subclass) => {
              const rowItems = durations
                .map((duration) =>
                  items.find((item) => item.primaryLabel === subclass && item.secondaryLabel === duration),
                )
                .filter((item): item is TargetEditorItem => item !== undefined);
              const rowTotal = rowItems.reduce((total, item) => total + (Number.isFinite(valueOf(item)) ? valueOf(item) : 0), 0);

              return (
                <tr key={subclass} className="max-sm:grid max-sm:grid-cols-3 max-sm:items-end max-sm:gap-x-2 max-sm:gap-y-1.5">
                  <td className="py-1.5 pr-3 text-xs text-foreground/85 max-sm:col-span-2 max-sm:row-start-1 max-sm:p-0">
                    {englishLabel(subclass)}
                  </td>
                  {rowItems.map((item) => (
                    <td key={item.key} className="px-1.5 py-1.5 max-sm:min-w-0 max-sm:p-0">
                      <span
                        aria-hidden="true"
                        className="mb-1 block text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase sm:hidden"
                      >
                        {englishLabel(item.secondaryLabel)}
                      </span>
                      <PercentInput
                        item={item}
                        text={textOf(item)}
                        changed={changedKeys.includes(item.key)}
                        label={`${englishLabel(subclass)} ${englishLabel(item.secondaryLabel)}`}
                        onChange={onChange}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pl-3 text-right font-mono text-[11px] text-muted-foreground max-sm:col-start-3 max-sm:row-start-1 max-sm:p-0">
                    {formatSharePercent(rowTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PercentInput({
  item,
  text,
  changed,
  label,
  onChange,
}: {
  item: TargetEditorItem;
  text: string;
  changed: boolean;
  label: string;
  onChange: (item: TargetEditorItem, text: string) => void;
}) {
  const parsed = parseLocaleNumber(text);
  const invalid = parsed === null || parsed > 100;

  return (
    <span className="relative flex items-center">
      <input
        inputMode="decimal"
        value={text}
        aria-label={`Percentage of ${englishLabel(label)}`}
        aria-invalid={invalid}
        onChange={(event) => onChange(item, event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        className={cn(
          "h-8 w-full rounded-lg border bg-background/60 pr-6 pl-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          invalid ? "border-destructive" : changed ? "border-warning-border bg-warning/25" : "border-border",
        )}
      />
      <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">%</span>
    </span>
  );
}

function SumBadge({ sum }: { sum: number }) {
  const ok = Math.abs(sum - 100) <= SUM_EPSILON;
  const difference = 100 - sum;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold",
        ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
      )}
    >
      {ok ? <CheckCircleIcon aria-hidden="true" size={12} weight="fill" /> : <WarningCircleIcon aria-hidden="true" size={12} weight="fill" />}Sum: {formatInput(sum)}%
      {ok ? null : difference > 0 ? ` · faltam ${formatInput(difference)}%` : ` · sobram ${formatInput(-difference)}%`}
    </span>
  );
}

function StackedBar({ segments }: { segments: { key: string; label: string; value: number }[] }) {
  const total = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(segment.value, 0) : 0), 0);
  const scale = Math.max(total, 100);

  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden="true">
      {segments.map((segment) =>
        Number.isFinite(segment.value) && segment.value > 0 ? (
          <div
            key={segment.key}
            className="h-full transition-[width] duration-200 ease-out first:rounded-l-full"
            style={{ width: `${(segment.value / scale) * 100}%`, backgroundColor: categoryColor(segment.label) }}
          />
        ) : null,
      )}
    </div>
  );
}

const PREVIEW_SCOPES: { scope: AllocationGroupKey; label: string }[] = [
  { scope: "ASSET_CLASS", label: "Class" },
  { scope: "CURRENCY", label: "Currency" },
  { scope: "STRATEGY", label: "Strategy" },
  { scope: "CLASS_CURRENCY", label: "Currency/class" },
  { scope: "FIXED_INCOME", label: "Fixed income" },
  { scope: "VARIABLE_INCOME", label: "Equities" },
];


const PreviewPanel = memo(function PreviewPanel({
  scope,
  onScopeChange,
  monthLabel,
  beforeRows,
  afterRows,
}: {
  scope: AllocationGroupKey;
  onScopeChange: (scope: AllocationGroupKey) => void;
  monthLabel: string | null;
  beforeRows: AllocationRow[];
  afterRows: AllocationRow[];
}) {
  const beforeByKey = new Map(beforeRows.map((row) => [row.key, row]));
  const rows = [...afterRows]
    .filter((row) => row.targetShare !== null || beforeByKey.get(row.key)?.targetShare !== null)
    .sort((left, right) => Math.abs(right.differenceBrl ?? 0) - Math.abs(left.differenceBrl ?? 0));

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6">
      <div>
        <h2 className="flex items-baseline gap-2 text-base font-semibold tracking-[-0.025em]">Buy and sell preview
          {monthLabel ? <span className="font-mono text-[11px] font-normal text-muted-foreground">{monthLabel}</span> : null}
        </h2>
        {monthLabel ? null : <p className="mt-1 text-[11px] text-muted-foreground">No reporting month available for simulation.</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
        {PREVIEW_SCOPES.map((entry) => (
          <button
            key={entry.scope}
            type="button"
            aria-pressed={entry.scope === scope}
            onClick={() => onScopeChange(entry.scope)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              entry.scope === scope ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {englishLabel(entry.label)}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="py-2.5 pr-2">Item</th>
              <th className="py-2.5 pr-2 max-sm:pr-1.5 text-right">Current</th>
              <th className="py-2.5 pr-2 max-sm:pr-1.5 text-right">Target</th>
              <th className="py-2.5 text-right">Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row) => {
              const previous = beforeByKey.get(row.key);
              const targetChanged =
                previous !== undefined && Math.abs((previous.targetShare ?? 0) - (row.targetShare ?? 0)) > 1e-9;
              const actionChanged = previous !== undefined && previous.direction !== row.direction;

              return (
                <tr key={row.key} className={cn(targetChanged && "bg-warning/15")}>
                  <td className="py-2.5 pr-2 max-sm:pr-1.5 text-xs text-foreground/85">{englishLabel(row.label)}</td>
                  <td className="py-2.5 pr-2 max-sm:pr-1.5 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                    {formatSharePercent(row.currentShare)}
                  </td>
                  <td className="py-2.5 pr-2 max-sm:pr-1.5 text-right font-mono text-[11px]">
                    {targetChanged ? (
                      <span>
                        <span className="text-muted-foreground line-through">
                          {formatSharePercent(previous?.targetShare ?? 0)}
                        </span>{" "}
                        <span className="text-foreground">{formatSharePercent(row.targetShare ?? 0)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {row.targetShare === null ? "—" : formatSharePercent(row.targetShare)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex flex-col items-end gap-1">
                      <DirectionBadge direction={row.direction} highlight={actionChanged} />
                      <span className="font-mono text-[11px] whitespace-nowrap text-foreground">
                        {row.differenceBrl === null ? "—" : formatBrl(row.differenceBrl)}
                      </span>
                      {targetChanged && previous?.differenceBrl !== null && previous?.differenceBrl !== undefined ? (
                        <span className="font-mono text-[9px] whitespace-nowrap text-muted-foreground line-through">
                          {formatBrl(previous.differenceBrl)}
                        </span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function DirectionBadge({ direction, highlight }: { direction: AllocationRow["direction"]; highlight: boolean }) {
  if (direction === null) {
    return null;
  }

  const label = direction === "SELL" ? "Sell" : direction === "BUY" ? "Buy" : "Balanced";

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase",
        direction === "SELL"
          ? "bg-destructive/10 text-destructive"
          : direction === "BUY"
            ? "bg-primary/10 text-primary"
            : "bg-white/[0.05] text-muted-foreground",
        highlight && "ring-1 ring-warning-border",
      )}
    >
      {englishLabel(label)}
    </span>
  );
}

const ToleranceCard = memo(function ToleranceCard({
  text,
  value,
  invalid,
  changed,
  onChange,
}: {
  text: string;
  value: number;
  invalid: boolean;
  changed: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label="Tolerance">
      <h2 className="text-base font-semibold tracking-[-0.025em]">Tolerance</h2>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_84px] items-center gap-3">
        <StepSlider
          value={value}
          max={MAX_REBALANCE_TOLERANCE}
          largeStep={5}
          label="Tolerance band"
          valueText={(current) => `${formatInput(current)} pontos percentuais`}
          onChange={(next) => onChange(formatInput(next))}
        />
        <span className="relative flex items-center">
          <input
            inputMode="decimal"
            value={text}
            aria-label="Tolerance in percentage points"
            aria-invalid={invalid}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(
              "h-8 w-full rounded-lg border bg-background/60 pr-7 pl-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              invalid ? "border-destructive" : changed ? "border-warning-border bg-warning/25" : "border-border",
            )}
          />
          <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">p.p.</span>
        </span>
      </div>
    </section>
  );
});

function draftValue(item: TargetEditorItem, draft: Draft) {
  const text = draft[item.key];
  return text === undefined ? item.percent : (parseLocaleNumber(text) ?? Number.NaN);
}

function draftTolerance(text: string | null, persisted: number) {
  return text === null ? persisted : (parseLocaleNumber(text) ?? Number.NaN);
}

function toTargets(items: TargetEditorItem[], draft: Draft): TargetValue[] {
  return items.map((item) => {
    const value = draftValue(item, draft);
    return {
      scope: item.scope,
      primaryLabel: item.primaryLabel,
      secondaryLabel: item.secondaryLabel,
      fraction: Number.isFinite(value) ? value / 100 : 0,
    };
  });
}


function previewTargets(items: TargetEditorItem[], draft: Draft): TargetValue[] {
  return withDerivedCurrency(toTargets(items, draft)).map((target) => ({
    ...target,
    scope: target.scope as AllocationGroupKey,
  }));
}

function isValidTolerance(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_REBALANCE_TOLERANCE &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  );
}


const INPUT_FORMAT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4, useGrouping: false });
const VERSION_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" });

function formatInput(value: number) {
  return INPUT_FORMAT.format(value);
}
