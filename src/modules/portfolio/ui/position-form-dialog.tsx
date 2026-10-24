"use client";

/** Single-page position creation with existing edit sections. Picker values preserve database keys while labels are displayed in English. */

import { FieldFeedbackProvider, type FieldFeedback } from "./field-feedback";
import { InternationalBondForm } from "./international-bond-form";
import { productType, listingMarket, LEGACY_DEBT_PRODUCTS } from "../presentation/asset-classification";
import { englishLabel } from "@/lib/english-labels";

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  LockSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";

import { addPositionAction, editPositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { Button } from "@/components/ui/button";
import { fixedIncomeName, fixedIncomeAllocation, brazilianFixedIncomeSchema, type BrazilianFixedIncome } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { automaticAllocation } from "@/modules/portfolio/domain/automatic-allocation";
import { isMarketKind, marketAllocation } from "@/modules/portfolio/domain/market-assets";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import type { EditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import type { MonthPosition, MonthQuote } from "@/modules/portfolio/application/get-month-positions";
import {
  ASSET_KIND_DEFINITIONS,
  ASSET_KINDS,
  baseCurrencyOf,
  buildAssetKey,
  cleanName,
  defaultAllocation,
  normalizeKey,
  normalizeTicker,
  tickerHint,
  USD_SYMBOL,
  type AssetKind,
} from "@/modules/portfolio/domain/asset-kinds";
import {
  ASSET_CLASSES,
  ASSET_TYPE_LABELS,
  ASSET_TYPES,
  classificationIssue,
  fitClassification,
  redemptionsOf,
  subclassesOf,
  type AssetType,
} from "@/modules/portfolio/domain/classification";
import { automaticLiquidity, normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { indexerOfSubclass, supportsAutoIncome, type AutoIncomeIndexer } from "@/modules/portfolio/domain/fixed-income-policy";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { treasuryYieldLabel, treasuryIndexerLabel } from "@/modules/portfolio/domain/treasury-purchase";
import type { TreasuryCatalogBond } from "@/modules/quotes/domain/treasury";
import { prefetchTreasuryCatalog, TreasuryPicker } from "@/modules/portfolio/ui/treasury-picker";
import { formatBrl, formatPriceBrl, formatCurrency, parseLocaleNumber, normalizeLocaleNumberInput } from "@/modules/portfolio/presentation/portfolio-format";
import {
  AllocationPicker,
  backdropClass,
  Field,
  inputClass,
  LiquidityPicker,
  primaryButtonClass,
  RedemptionPicker,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";
import {
  tickerCheckAllowsSaving,
  type CoinCandidate,
  type TickerCheckResponse,
} from "@/modules/quotes/domain/ticker-check";


export type PositionFormMonth = { id: string; label: string; isCurrent: boolean; quotes: MonthQuote[]; referenceDate: Date };
export type PositionFormTarget = { mode: "add" } | { mode: "edit"; position: MonthPosition };

type TabKey = "geral" | "ativo" | "rateio" | "revisar";

type AllocationRow = { key: number; assetClass: string; subclass: string; duration: string; weight: string; rate: string };

function rateText(rate: number | null | undefined) {
  return rate === null || rate === undefined ? "" : String(rate);
}
type Issue = { tab: TabKey; message: string };

const TABS: { key: TabKey; label: string }[] = [
  { key: "geral", label: "Overall" },
  { key: "ativo", label: "Asset" },
  { key: "rateio", label: "Allocation" },
];
const CHECK_DEBOUNCE_MS = 500;

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(600px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function PositionFormDialog({
  open,
  onOpenChange,
  target,
  formKey,
  catalog,
  month,
  occupied,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  target: PositionFormTarget | null;

  formKey: number;
  catalog: EditingCatalog;
  month: PositionFormMonth;

  occupied: Set<string>;
  onSaved: (result: EditActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="position-form">
          {target ? (
            <PositionForm
              key={formKey}
              target={target}
              catalog={catalog}
              month={month}
              occupied={occupied}
              onSaved={(result) => {
                onSaved(result);
                onOpenChange(false);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PositionForm({
  target,
  catalog,
  month,
  occupied,
  onSaved,
}: {
  target: PositionFormTarget;
  catalog: EditingCatalog;
  month: PositionFormMonth;
  occupied: Set<string>;
  onSaved: (result: EditActionResult) => void;
}) {
  const editing = target.mode === "edit" ? target.position : null;
  const [tab, setTab] = useState<TabKey>("geral");
  const [showIssues, setShowIssues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const bondFormId = useId();
  const [bondSaving, setBondSaving] = useState(false);
  const [bondIssues, setBondIssues] = useState<string[]>(["Bond details"]);


  // General settings.
  const [reviewProduct, setReviewProduct] = useState<string | null>(editing?.productType && (LEGACY_DEBT_PRODUCTS as readonly string[]).includes(editing.productType) ? editing.productType : null);
  const [fiProduct, setFiProduct] = useState<"CDB" | "LCI" | "LCA">("CDB");
  const [fiIssuer, setFiIssuer] = useState("");
  const [fiIndexer, setFiIndexer] = useState<"CDI" | "PRE" | "IPCA">("CDI");
  const [fiRate, setFiRate] = useState("");
  const [kind, setKind] = useState<AssetKind | null>(null);
  const bondEntry = !editing && kind === "international-bond";
  const busy = isSaving || (bondEntry && bondSaving);
  const [verificationEpoch, setVerificationEpoch] = useState(0);
  const [entryType, setEntryType] = useState<"asset" | "cash">("asset");
  const [assetName, setAssetName] = useState(editing?.assetName ?? "");
  const [value, setValue] = useState(editing ? editableValue(editing) : "");

  const initialKind = "OPENING" as const;
  const [latestPurchaseDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [selectedTreasury, setSelectedTreasury] = useState<TreasuryCatalogBond | null>(null);
  const [contractedRate, setContractedRate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [commission, setCommission] = useState("0");
  const [purchaseDate, setPurchaseDate] = useState(latestPurchaseDay);
  const strategy = editing?.strategy ?? "";
  // Asset details.
  const [tickerText, setTickerText] = useState("");
  const [coinChoice, setCoinChoice] = useState<{ symbol: string; id: string } | null>(null);
  const [coinCandidates, setCoinCandidates] = useState<{ symbol: string; coins: CoinCandidate[] } | null>(null);
  const [manualPrice, setManualPrice] = useState("");


  const [valueKind, setValueKind] = useState<"quantity" | "amount">("quantity");
  const [maturity, setMaturity] = useState(editing?.maturityDate ?? "");
  const [liquidity, setLiquidity] = useState(editing?.liquidity ?? "");


  const [assetType, setAssetType] = useState<AssetType | null>(editing?.assetType ?? null);

  const [rows, setRows] = useState<AllocationRow[] | null>(() =>
    editing
      ? editing.allocations.map((allocation, index) => ({
          key: index,
          assetClass: allocation.assetClass,
          subclass: allocation.subclass,
          duration: allocation.duration,
          weight: formatWeight(allocation.weight),
          rate: rateText(allocation.ratePercent),
        }))
      : null,
  );
  const [nextRowKey, setNextRowKey] = useState(100);


  const [autoIncome, setAutoIncome] = useState(editing?.autoIncome ?? false);
  const [appliedOn, setAppliedOn] = useState(() => defaultAppliedOn());

  const quoteOf = (symbol: string) => month.quotes.find((entry) => entry.symbol === symbol)?.valueBrl ?? null;


  const account = catalog.portfolioAccountId ? { accountId: catalog.portfolioAccountId } : {};

  const resetFields = () => {
    setBondIssues(["Bond details"]);
    setFiProduct("CDB"); setFiIssuer(""); setFiIndexer("CDI"); setFiRate("");
    setSelectedTreasury(null); setContractedRate("");
    setAssetName(""); setValue(""); setTickerText(""); setManualPrice("");
    setCoinChoice(null); setCoinCandidates(null); setSide("BUY");
    setPurchasePrice(""); setCommission("0"); setPurchaseDate(latestPurchaseDay);
    setValueKind("quantity"); setMaturity(""); setLiquidity("");
    setAssetType(null); setRows(null); setNextRowKey(100); setAutoIncome(false);
    setAppliedOn(defaultAppliedOn()); setTab("geral");
    setShowIssues(false); setError(null); setVerificationEpoch((current) => current + 1);
  };
  const chooseKind = (next: string) => {
    if (next === kind) return;
    resetFields();
    setKind(next as AssetKind);
    if (next === "fixed-income") { setAutoIncome(true); setLiquidity("No vencimento"); }
    if (next === "treasury") void prefetchTreasuryCatalog().catch(() => undefined);
  };


  const definition = kind ? ASSET_KIND_DEFINITIONS[kind] : null;
  const inputSymbol =
    (definition?.ticker === "usd" || definition?.ticker === "eur")
      ? normalizeTicker(kind!, "")
      : definition?.ticker === "market" && kind
        ? normalizeTicker(kind, tickerText)
        : null;
  const chosenCoinId = kind === "crypto" && inputSymbol && coinChoice?.symbol === inputSymbol ? coinChoice.id : null;
  const check = useTickerCheck(
    month.id,
    !editing && definition?.ticker === "market" ? kind : null,
    kind === "eu-market" ? tickerText.trim().toUpperCase() || null : inputSymbol,
    chosenCoinId,
    verificationEpoch,
  );
  const symbol = kind === "eu-market" && check.state === "done" && check.response.status === "found" ? check.response.symbol : inputSymbol;
  const checkedCoins = check.state === "done" && check.response.status === "found" ? check.response.coins : undefined;

  if (symbol && checkedCoins && coinCandidates?.symbol !== symbol) {
    setCoinCandidates({ symbol, coins: checkedCoins });
  }

  const coins = kind === "crypto" && symbol && coinCandidates?.symbol === symbol ? coinCandidates.coins : null;
  const checkedCoinId =
    check.state === "done" && check.response.status === "found" ? (check.response.coinId ?? null) : null;
  const automaticName = !editing && definition?.ticker === "market";
  const response = check.state === "done" ? check.response : null;
  const identity = response?.status === "found" ? response.identity : undefined;
  const purchaseEntry = !editing && kind !== null && (isMarketKind(kind) || kind === "crypto" || kind === "treasury");
  const tradeCurrency = identity?.currency ?? (kind === "crypto" ? "USD" : kind === "treasury" ? "BRL" : null);
  const priceNative = response?.status === "found" ? response.priceNative ?? null : null;
  const purchaseUnit = parseLocaleNumber(purchasePrice);
  const purchaseFee = kind === "treasury" ? 0 : parseLocaleNumber(commission);
  const autoLiquidity = kind ? automaticLiquidity(kind, identity?.exposure ?? null) : null;
  const fixedIncomeEntry = !editing && kind === "fixed-income";
  const fixedContract: BrazilianFixedIncome | null = fixedIncomeEntry ? { product: fiProduct, issuer: fiIssuer.trim(), indexer: fiIndexer, rate: normalizeLocaleNumberInput(fiRate) ?? "", basis: "BUSINESS_252" } : null;
  const typedName = fixedContract ? fixedIncomeName(fixedContract, maturity, appliedOn) : automaticName
    ? cleanName(selectedTreasury?.name ?? catalog.assets.find((asset) => symbol !== null && asset.quoteSymbol === symbol)?.name ?? (response?.status === "found" ? response.name : null) ?? symbol ?? "").slice(0, 80)
    : cleanName(assetName);
  const treasuryMaturity = (editing?.quoteSymbol ?? (kind === "treasury" ? symbol : null))?.startsWith("TD:")
    ? (editing?.quoteSymbol ?? symbol)!.slice(-10) : null;
  const maturityDate = treasuryMaturity ?? ((editing ? allowsMaturityOf(editing) : definition?.allowsMaturity) && maturity ? maturity : null);
  const assetKey =
    !editing && definition && normalizeKey(typedName) && (definition.ticker === null ? typedName : symbol)
      ? buildAssetKey({ name: typedName, ticker: symbol, institutionName: "Portfolio", maturityDate })
      : null;
  const catalogAsset = !fixedIncomeEntry && assetKey ? catalog.assets.find((asset) => asset.normalizedKey === assetKey || (definition?.ticker === "market" && symbol !== null && asset.quoteSymbol === symbol)) : undefined;
  const isNewAsset = !editing && assetKey !== null && !catalogAsset;
  const needsManualPrice =
    isNewAsset &&
    definition?.ticker === "market" &&
    !purchaseEntry && (response?.status === "unavailable" || (response?.status === "found" && !month.isCurrent));
  const manualPriceValue = parseLocaleNumber(manualPrice);
  const treasury = !editing && kind === "treasury";

  const officialTreasuryPrice =
    treasury && isNewAsset && response?.status === "found" && month.isCurrent ? response.priceBrl : null;
  const showPriceField = !treasury && (needsManualPrice || officialTreasuryPrice !== null);
  const ownTreasuryPrice = officialTreasuryPrice !== null && manualPriceValue !== null && manualPriceValue > 0;


  let price: number | null = null;
  let missingQuoteSymbol: string | null = null;
  let tickerIssue: string | null = null;

  if (editing) {
    price = editing.unitPriceBrl;
  } else if (catalogAsset) {
    price = catalogAsset.quoteSymbol ? quoteOf(catalogAsset.quoteSymbol) : null;
    missingQuoteSymbol = catalogAsset.quoteSymbol && !price ? catalogAsset.quoteSymbol : null;
  } else if (definition?.ticker === "usd" || definition?.ticker === "eur") {
    price = quoteOf(symbol!);
  } else if (definition?.ticker === "market") {
    if (!symbol) {
      tickerIssue = "Enter a valid ticker.";
    } else if (identity && !identity.exposure) {
      tickerIssue = "This fund cannot be added until its asset class has been identified.";
    } else if (!tickerCheckAllowsSaving(response)) {
      tickerIssue = check.state === "checking" || check.state === "idle" ? "Wait for ticker verification." : "Verify the ticker.";
    } else if (response.status === "known" || (response.status === "found" && month.isCurrent)) {
      price = ownTreasuryPrice ? manualPriceValue : response.priceBrl;
    } else if (needsManualPrice) {
      price = manualPriceValue !== null && manualPriceValue > 0 ? manualPriceValue : null;
    }
  }

  const quoted = editing ? Boolean(editing.quoteSymbol) : catalogAsset ? Boolean(catalogAsset.quoteSymbol) : Boolean(definition?.ticker);
  const quoteSymbol = editing ? editing.quoteSymbol : (catalogAsset?.quoteSymbol ?? symbol);
  const amountMode = treasury && !purchaseEntry && valueKind === "amount";
  const valueLabel =
    !editing && !kind
      ? "Quantity or balance"
      : amountMode
        ? "Position value (BRL)"
        : treasury
          ? "Number of securities"
          : quoteSymbol === USD_SYMBOL || quoteSymbol === "EUR"
            ? `Balance (${quoteSymbol})`
            : quoted
              ? "Quantity"
              : "Balance (BRL)";
  const parsedValue = parseLocaleNumber(value);

  const positionTotal =
    parsedValue === null ? null : amountMode ? parsedValue : quoted ? (price === null ? null : parsedValue * price) : parsedValue;
  const impliedQuantity = amountMode && parsedValue !== null && price ? parsedValue / price : null;
  const duplicate = Boolean(
    account?.accountId && catalogAsset && occupied.has(`${account.accountId}:${catalogAsset.id}`),
  );


  const derivedRows: AllocationRow[] =
    catalogAsset && catalogAsset.allocations.length > 0
      ? catalogAsset.allocations.map((allocation, index) => ({
          key: index,
          assetClass: allocation.assetClass,
          subclass: allocation.subclass,
          duration: allocation.duration,
          weight: formatWeight(allocation.weight),
          rate: rateText(allocation.ratePercent),
        }))
      : kind
        ? (fixedContract ? [fixedIncomeAllocation(fixedContract, appliedOn, maturity)] : kind === "treasury" && selectedTreasury ? [{ assetClass: "Renda Fixa", subclass: /IPCA|Renda|Educa/i.test(selectedTreasury.type) ? "IPCA" : /Selic|Reserva|IGPM/i.test(selectedTreasury.type) ? "Pós-fixado" : "Prefixado", duration: "Longo" }] : editing ? [defaultAllocation(kind, symbol)] : isMarketKind(kind) ? identity ? marketAllocation(identity) : [] : automaticAllocation(kind, symbol)).map((seed, key) => ({ key, ...seed, weight: "100", rate: fixedContract?.rate ?? "" }))
        : [{ key: 0, assetClass: "", subclass: "", duration: "", weight: "100", rate: "" }];
  const allocationRows = rows ?? derivedRows;
  const weightSum = allocationRows.reduce((total, row) => total + (parseLocaleNumber(row.weight) ?? 0), 0);


  const knownRow = (row: AllocationRow) =>
    classificationIssue(row) === null ||
    Boolean(
      editing?.allocations.some(
        (entry) => entry.assetClass === row.assetClass && entry.subclass === row.subclass && entry.duration === row.duration,
      ),
    );
  const rowsComplete = allocationRows.every(
    (row) =>
      row.assetClass.trim() &&
      row.subclass.trim() &&
      row.duration.trim() &&
      knownRow(row) &&
      (parseLocaleNumber(row.weight) ?? 0) > 0,
  );
  const balanced = (!editing && allocationRows.length === 0) || Math.abs(weightSum - 100) <= 0.01;

  const changeRows = (change: (current: AllocationRow[]) => AllocationRow[]) => setRows(change(allocationRows));


  const updateRow = (key: number, field: keyof Omit<AllocationRow, "key">, text: string) =>
    changeRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const changed = { ...row, [field]: text };
        const next = field === "assetClass" ? { ...changed, ...fitClassification(changed) } : changed;

        return indexerOfSubclass(next.subclass) === indexerOfSubclass(row.subclass) ? next : { ...next, rate: "" };
      }),
    );


  const incomeType = editing ? (editing.quoteSymbol ? null : editing.assetType) : isNewAsset ? kind : null;
  const rowIndexer = (row: AllocationRow): AutoIncomeIndexer | null =>
    supportsAutoIncome(incomeType) ? indexerOfSubclass(row.subclass) : null;
  const incomeAvailable = allocationRows.some((row) => rowIndexer(row) !== null);
  const wantsAutoIncome = incomeAvailable && (fixedIncomeEntry || autoIncome);
  const rowRate = (row: AllocationRow) => (rowIndexer(row) && row.rate.trim() ? row.rate.trim() : null);

  const issues: Issue[] = [];
  if (fixedIncomeEntry && (!fiIssuer.trim() || fiIssuer.trim().length > 40 || !appliedOn || !maturity || maturity <= appliedOn || appliedOn > latestPurchaseDay || parseLocaleNumber(fiRate) === null || parseLocaleNumber(fiRate)! <= 0 || !brazilianFixedIncomeSchema.safeParse(fixedContract).success || parsedValue === null || parsedValue <= 0)) issues.push({ tab: "ativo", message: "Enter the issuer, invested amount, purchase date, maturity and contracted rate." });
  if (purchaseEntry && (purchaseUnit === null || purchaseUnit <= 0 || purchaseFee === null || purchaseFee < 0 || !purchaseDate || !tradeCurrency || parsedValue === null || parsedValue <= 0)) {
    issues.push({ tab: "ativo", message: kind === "treasury" ? "Enter the price per title, a positive quantity and purchase date." : "Enter the execution price, a positive quantity, commission (zero if none) and trade date." });
  }

  if (purchaseEntry && kind === "treasury" && (!selectedTreasury || parseLocaleNumber(contractedRate) === null || (parsedValue !== null && Math.abs(parsedValue * 100 - Math.round(parsedValue * 100)) > 1e-7))) issues.push({ tab: "ativo", message: "Choose a security, enter the contracted annual rate and use quantities in increments of 0.01." });
  if (purchaseEntry && side === "SELL" && !catalogAsset) issues.push({ tab: "ativo", message: "You must own this asset before selling it." });
  if (purchaseEntry && side === "SELL" && parsedValue !== null && purchaseUnit !== null && purchaseFee !== null && parsedValue * purchaseUnit <= purchaseFee) issues.push({ tab: "ativo", message: "Commission must be less than the sale proceeds." });
  if (!editing) {
    if (!kind) {
      issues.push({ tab: "geral", message: "Choose the asset type." });
    }
  }
  if (!typedName) {
    issues.push({ tab: editing ? "geral" : "ativo", message: "Enter the asset name." });
  }
  if (!editing && (parsedValue === null || parsedValue < 0)) {
    issues.push({
      tab: "ativo",
      message: !editing && !kind ? "Enter the quantity or balance." : quoted && quoteSymbol !== USD_SYMBOL ? "Enter the quantity." : "Enter the balance.",
    });
  }
  if (duplicate && !purchaseEntry) {
    issues.push({ tab: "ativo", message: "This asset already has a position in your portfolio." });
  }
  if (!editing && kind) {
    if (tickerIssue && !catalogAsset) {
      issues.push({ tab: "ativo", message: tickerIssue });
    }
    if (needsManualPrice && (manualPriceValue === null || manualPriceValue <= 0)) {
      issues.push({ tab: "ativo", message: treasury ? "Enter the security price in BRL." : "Enter the quote in BRL." });
    }
    if (officialTreasuryPrice !== null && manualPrice.trim() !== "" && !ownTreasuryPrice) {
      issues.push({ tab: "ativo", message: "Enter a valid security price or leave blank to use the official price." });
    }
    if (missingQuoteSymbol && !purchaseEntry) {
      issues.push({
        tab: "ativo",
        message: `No quote exists for ${missingQuoteSymbol} in this reporting month. Enter it on the Quotes page first.`,
      });
    }
  }
  if (!rowsComplete) {
    issues.push({ tab: "rateio", message: "Choose a class, subclass and redemption term from the list and enter each allocation weight." });
  } else if (!balanced) {
    issues.push({ tab: "rateio", message: `The allocation adds up to ${formatWeight(weightSum)}%; it must total 100%.` });
  }

  const badRate = allocationRows.findIndex((row) => {
    const rate = rowRate(row);
    return rate !== null && !((parseLocaleNumber(rate) ?? 0) > 0);
  });

  if (badRate >= 0) {
    issues.push({ tab: "rateio", message: `Review the rate of return for classification ${badRate + 1}.` });
  } else if (wantsAutoIncome && allocationRows.some((row) => !rowIndexer(row))) {
    issues.push({
      tab: "rateio",
      message: "With automatic accrual, every classification must be floating-rate or fixed-rate.",
    });
  } else if (wantsAutoIncome && allocationRows.some((row) => !rowRate(row))) {
    issues.push({ tab: "rateio", message: "Enter the rate of return to calculate accrual automatically." });
  }
  if (wantsAutoIncome && !editing && !appliedOn) {
    issues.push({ tab: "rateio", message: "Enter the investment date." });
  }

  const tabsWithIssues = new Set(issues.map((issue) => issue.tab));
  const visibleIssue = (showIssues || !editing) ? (issues.find((issue) => issue.tab === tab) ?? issues[0] ?? null) : null;

  const submit = () => {
    setError(null);

    if (issues.length > 0) {
      setShowIssues(true);
      if (!tabsWithIssues.has(tab)) {
        setTab(issues[0].tab);
      }
      return;
    }

    const income = supportsAutoIncome(incomeType) ? { autoIncome: wantsAutoIncome } : {};
    const allocations = allocationRows.map((row) => ({
      assetClass: row.assetClass.trim(),
      subclass: row.subclass.trim(),
      duration: row.duration.trim(),
      weightPercent: row.weight.trim().replace(",", "."),
      ratePercent: rowRate(row),
    }));

    startSaving(async () => {
      let result: EditActionResult;

      if (editing) {
        result = await editPositionAction({
          monthId: month.id,
          edit: {
            positionId: editing.id,
            strategy: strategy || null,
            allocations,
            asset: {
              name: typedName,
              liquidity: normalizeLiquidity(liquidity),
              maturityDate,
              ...(assetType ? { assetType } : {}),
              ...(assetType === "fixed-income" && reviewProduct ? { displayProduct: reviewProduct } : {}),
              ...income,
            },
          },
        });
      } else if (kind && account) {
        result = await addPositionAction({
          monthId: month.id,
          addition: {
            ...account,
            ...(catalogAsset
              ? { assetId: catalogAsset.id }
              : {
                  newAsset: {
                    name: typedName,
                    kind,
                    ticker: symbol,
                    maturityDate,
                    liquidity: autoLiquidity ?? normalizeLiquidity(liquidity),
                    quoteCheckToken:
                      response?.status === "found" || response?.status === "unavailable" ? response.token : null,
                    manualPriceBrl: needsManualPrice || ownTreasuryPrice ? manualPrice.trim() : null,
                    ...income,
                    ...(wantsAutoIncome ? { appliedOn } : {}),
                    ...(fixedContract ? { fixedIncomeContract: fixedContract } : {}),
                  },
                }),
            value: purchaseEntry || fixedIncomeEntry ? normalizeLocaleNumberInput(value) ?? value.trim() : value.trim(),
            ...(purchaseEntry && tradeCurrency && purchaseUnit !== null && purchaseFee !== null ? { purchase: { side, price: normalizeLocaleNumberInput(purchasePrice)!, commission: kind === "treasury" ? "0" : normalizeLocaleNumberInput(commission)!, currency: tradeCurrency, occurredOn: purchaseDate, ...(kind === "treasury" ? { contractedRate: normalizeLocaleNumberInput(contractedRate)! } : {}) } } : {}),
            ...(amountMode ? { valueKind: "amount" as const } : {}),
            initialKind,
            strategy: strategy || null,
            allocations,
          },
        });
      } else {
        return;
      }

      if (result.ok) {
        onSaved(result);
      } else {
        if (!editing && /Ticker verification for .* has expired/i.test(result.message)) {
          check.refresh();
          setTab("ativo");
          setError("Verification expired. We are refreshing the quote; review the details and continue. Your entries have been preserved.");
        } else setError(result.message);
      }
    });
  };

  const market = !editing && definition?.ticker === "market";
  const baseCurrency = editing?.baseCurrency ?? catalogAsset?.baseCurrency ?? identity?.currency ?? (kind && !isMarketKind(kind) ? baseCurrencyOf(kind, symbol) : null);
  const canEditMaturity = !treasuryMaturity && kind !== "treasury" && (editing ? allowsMaturityOf(editing) : Boolean(definition?.allowsMaturity));


  const fieldFeedback: Record<string, FieldFeedback> = {};
  const requireField = (label: string, valid: boolean) => { fieldFeedback[label] = { valid }; };
  requireField(entryType === "cash" ? "Currency" : "Asset type", Boolean(editing ? assetType : kind));
  if (editing) requireField("Asset name", Boolean(typedName));
  if (!editing && kind && !bondEntry) {
    if (fixedIncomeEntry) {
      requireField("Issuer", Boolean(fiIssuer.trim()) && fiIssuer.trim().length <= 40);
      requireField("Amount invested", parsedValue !== null && parsedValue > 0);
      requireField("Purchase date", Boolean(appliedOn) && appliedOn <= latestPurchaseDay);
      requireField("Maturity date", Boolean(maturity) && maturity > appliedOn);
      requireField(fiIndexer === "CDI" ? "Percentage of CDI" : fiIndexer === "IPCA" ? "Annual yield above IPCA" : "Annual yield", brazilianFixedIncomeSchema.shape.rate.safeParse(normalizeLocaleNumberInput(fiRate) ?? "").success);
    } else if (purchaseEntry) {
      requireField(kind === "treasury" ? "Tesouro Direto security" : "Ticker", Boolean(symbol) && !tickerIssue);
      requireField(kind === "treasury" ? "Titles Purchased" : "Quantity", parsedValue !== null && parsedValue > 0 && (kind !== "treasury" || Math.abs(parsedValue * 100 - Math.round(parsedValue * 100)) < 1e-7));
      requireField(kind === "treasury" ? "Price per Title" : side === "SELL" ? "Sale price" : "Purchase price", purchaseUnit !== null && purchaseUnit > 0);
      requireField(kind === "treasury" ? "Purchase date" : "Trade date", Boolean(purchaseDate) && purchaseDate <= latestPurchaseDay);
      if (kind === "treasury") requireField(treasuryYieldLabel(selectedTreasury?.indexer), parseLocaleNumber(contractedRate) !== null);
      else requireField("Commission", purchaseFee !== null && purchaseFee >= 0);
      if (needsManualPrice) requireField("Quote in BRL", manualPriceValue !== null && manualPriceValue > 0);
    } else {
      requireField(entryType === "cash" ? "Cash name" : "Asset name", Boolean(typedName));
      requireField(valueLabel, parsedValue !== null && parsedValue >= 0);
    }
  }
  const remainingFields = Object.entries(fieldFeedback).filter(([, state]) => !state.valid).map(([label]) => label);
  const activeIssues = bondEntry ? bondIssues : remainingFields;
  const ready = bondEntry ? bondIssues.length === 0 : issues.length === 0;

  return (
    <FieldFeedbackProvider fields={fieldFeedback}>
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">
            {editing ? `Edit ${editing.assetName}` : purchaseEntry ? kind === "treasury" ? "Add purchase" : "Record trade" : "Add position"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
            {editing
              ? englishLabel(month.label)
              : `${englishLabel(month.label)} · enter the position details and save.`}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Close"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <Tabs.Root value={tab} onValueChange={(next) => setTab(next as TabKey)} className="flex min-h-0 flex-1 flex-col">
        {editing ? <Tabs.List
          aria-label="Position sections"
          className="relative mx-5 mt-4 grid shrink-0 grid-cols-3 rounded-xl border border-border bg-background/40 p-1 sm:mx-6"
        >
          <Tabs.Indicator className="absolute top-1 bottom-1 left-[var(--active-tab-left)] w-[var(--active-tab-width)] rounded-lg bg-white/[0.07] transition-[left,width] duration-200 ease-out" />
          {TABS.map((entry) => {
            const locked = entry.key !== "geral" && !editing && kind === null;

            return (
              <Tabs.Tab
                key={entry.key}
                value={entry.key}
                disabled={locked}
                title={locked ? "Choose the asset type in the General tab to enable this." : undefined}
                data-locked={locked ? "" : undefined}
                className="relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-active:text-foreground data-disabled:cursor-not-allowed data-disabled:text-muted-foreground/50 data-disabled:hover:text-muted-foreground/50"
              >
                {locked ? (
                  <LockSimpleIcon aria-hidden="true" size={12} weight="bold" className="shrink-0" />
                ) : null}
                {englishLabel(entry.label)}
                {entry.key === "rateio" && !locked ? (
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      balanced && rowsComplete ? "text-muted-foreground" : "text-warning-foreground",
                    )}
                  >
                    {formatWeight(weightSum)}%
                  </span>
                ) : null}
                {showIssues && !locked && tabsWithIssues.has(entry.key) ? (
                  <span aria-label="with pending items" className="size-1.5 rounded-full bg-warning-foreground" />
                ) : null}
              </Tabs.Tab>
            );
          })}
        </Tabs.List> : null}

        {!editing && catalogAsset ? (
          <div className="mx-5 mt-3 sm:mx-6" data-asset-existing="">
            <StatusLine tone="success">
              {`${catalogAsset.name} already exists: the position uses this asset and the allocation from its latest position.`}
            </StatusLine>
          </div>
        ) : null}


        <div className="min-h-[min(19rem,40dvh)] flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <PositionSection single={!editing} value="geral" className="space-y-4 outline-none">
            {!editing ? <div role="group" aria-label="Entry type" className="flex gap-2">
              {(["asset", "cash"] as const).map((type) => <Button key={type} type="button" variant={entryType === type ? "default" : "outline"} aria-pressed={entryType === type} onClick={() => { if (entryType === type) return; resetFields(); setEntryType(type); setKind(null); }}>
                {type === "asset" ? "Asset" : "Cash"}
              </Button>)}
            </div> : null}
            {editing ? (
              <div className="grid gap-3">
                <Field label="Asset type">
                  <Picker
                    aria-label="Asset type"
                    options={ASSET_TYPES.map((entry) => ({ value: entry, label: ASSET_TYPE_LABELS[entry] }))}
                    value={assetType}
                    onValueChange={(next) => { setAssetType(next as AssetType); setReviewProduct(null); }}
                  />
                </Field>
                {assetType === "fixed-income" ? <Field label="Product"><Picker aria-label="Debt product" value={reviewProduct} options={LEGACY_DEBT_PRODUCTS.map((value) => ({ value, label: value }))} onValueChange={setReviewProduct} placeholder="Select the product from your statement" /></Field> : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <Field label={entryType === "cash" ? "Currency" : "Asset type"}>
                  <Picker
                    aria-label={entryType === "cash" ? "Cash currency" : "Asset type"}
                    options={ASSET_KINDS.filter((entry) => !["us-etf", "us-stock", "br-etf", "br-stock"].includes(entry) && (entry === "brl-cash" || entry === "usd-balance" || entry === "eur-balance") === (entryType === "cash")).map((entry) => ({
                      value: entry,
                      label: englishLabel(ASSET_KIND_DEFINITIONS[entry].label),
                      hint: ASSET_KIND_DEFINITIONS[entry].hint,
                    }))}
                    value={kind}
                    onValueChange={chooseKind}
                    placeholder="Choose the type"
                  />
                </Field>

              </div>
            )}

            {editing ? <>
            <Field label="Asset name">
              <input
                aria-label="Asset name"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                autoComplete="off"
                placeholder={market ? "For example, ETF - VOO" : "For example, Bank X CDB 110%"}
                className={inputClass}
              />
            </Field>
            {editing ? (
              <p className="-mt-1.5 text-[11px] text-muted-foreground">The asset type and name apply to every month.</p>
            ) : null}

            </> : null}
            <div className="grid grid-cols-2 gap-3">
              {editing ? <ReadOnly label={valueLabel} value={value} mono /> : null}

            </div>
            {editing ? <p className="-mt-1.5 text-[11px] text-muted-foreground" data-testid="position-form-value-hint">Use Transactions to change the quantity or balance.</p> : null}

          </PositionSection>

          {bondEntry ? <InternationalBondForm formId={bondFormId} month={month} account={account} onSaved={onSaved} onPendingChange={setBondSaving} onValidationChange={setBondIssues} /> : <>
          <PositionSection single={!editing} value="ativo" className="space-y-4 outline-none">
            {!editing ? <SectionHeading title={fixedIncomeEntry ? "Investment details" : kind === "treasury" ? "Purchase details" : purchaseEntry ? "Trade details" : entryType === "cash" ? "Cash balance" : "Enter the asset and current balance"} description={fixedIncomeEntry || kind === "treasury" ? null : purchaseEntry ? "Record a buy or sell. Commission is included in your gains." : entryType === "cash" ? "Name your cash holding and enter its current balance." : "The quote is verified automatically. Then enter the quantity or balance for this position."} /> : null}
            {!editing && !kind ? (
              <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">Choose the asset type above.
              </p>
            ) : (
              <>
                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ReadOnly label="Ticker" value={editing.ticker ?? "No ticker · balance"} mono />
                    <ReadOnly label="Base currency" value={editing.baseCurrency} mono />
                    {editing.unitPriceBrl !== null ? (
                      <ReadOnly label={`Quote for ${englishLabel(month.label)}`} value={formatPriceBrl(editing.unitPriceBrl)} mono />
                    ) : null}
                  </div>
                ) : null}

                {market && kind ? (
                  <>
                    {kind === "treasury" ? (
                      <Field label="Tesouro Direto security">
                        <TreasuryPicker value={symbol} onSelect={(bond) => {
                          setSelectedTreasury(bond); setCommission("0");
                          setPurchasePrice(""); setContractedRate(""); setValue("");
                          setTickerText(bond.symbol);
                          setMaturity(bond.maturityDate);
                          setAssetName(bond.name);
                        }} />
                      </Field>
                    ) : <Field label="Ticker">
                      <input
                        aria-label="Ticker"
                        value={tickerText}
                        onChange={(event) => setTickerText(event.target.value.toUpperCase())}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={kind === "crypto" ? "ETH" : kind === "eu-market" ? "UETW" : kind.startsWith("br") ? "GPCA11" : "VOO"}
                        className={cn(inputClass, "font-mono uppercase")}
                      />
                    </Field>}
                    <TickerStatus
                      kind={kind}
                      text={tickerText}
                      symbol={kind === "eu-market" ? tickerText.trim() || null : symbol}
                      check={check}
                      monthLabel={month.label}
                      isCurrent={month.isCurrent}
                    />
                    {purchaseEntry && kind !== "treasury" && response?.status === "found" && tradeCurrency && priceNative !== null ? <p className="font-mono text-sm text-muted-foreground">Market price {formatCurrency(priceNative, tradeCurrency, false, kind === "crypto" ? 8 : 2)}</p> : null}
                    {response?.status === "matches" ? <Field label="Matching listings">
                      <div className="space-y-2" aria-label="Matching European listings">
                        {response.listings.map((listing) => <button key={listing.symbol} type="button"
                          aria-label={`${listing.symbol} · ${listing.exchange} · ${listing.currency ?? "Currency unavailable"} · ${listing.name}`}
                          disabled={!listing.currency || !["EUR", "USD", "BRL"].includes(listing.currency)}
                          className="w-full rounded-xl border border-border p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => setTickerText(listing.symbol)}>
                          <span className="block font-semibold">{listing.symbol} · {listing.exchange} · {listing.currency ?? "Currency unavailable"}</span>
                          <span className="block text-sm text-muted-foreground">{listing.name}</span>
                        </button>)}
                      </div>
                    </Field> : null}
                    {coins && coins.length > 1 && symbol ? (
                      <Field label={`Currency · ${coins.length} with symbol ${symbol}`}>
                        <Picker
                          aria-label="CoinGecko coin"
                          options={coins.map((coin) => ({ value: coin.id, label: coin.name, hint: coin.id }))}
                          value={chosenCoinId ?? checkedCoinId ?? coins[0].id}
                          onValueChange={(id) => setCoinChoice({ symbol, id })}
                        />
                      </Field>
                    ) : null}
                    {showPriceField ? (
                      <div className="space-y-1.5">
                        <Field label={treasury ? "Security price (BRL)" : "Quote in BRL"}>
                          <input
                            aria-label={treasury ? "Security price" : "Quote in BRL"}
                            inputMode="decimal"
                            value={manualPrice}
                            onChange={(event) => setManualPrice(event.target.value)}
                            placeholder={officialTreasuryPrice !== null ? formatNumberText(officialTreasuryPrice) : "0,00"}
                            className={cn(
                              inputClass,
                              "text-right font-mono",
                              manualPrice.trim() !== "" && (manualPriceValue === null || manualPriceValue <= 0) && "border-destructive",
                            )}
                          />
                        </Field>
                        {officialTreasuryPrice !== null ? (
                          <p className="text-[11px] leading-5 text-muted-foreground" data-testid="treasury-price-hint">
                            {ownTreasuryPrice
                              ? `Your price applies only to your portfolio this month. The official price is ${formatPriceBrl(officialTreasuryPrice)}.`
                              : `Official price: ${formatPriceBrl(officialTreasuryPrice)}. Leave blank to use it or enter your own price.`}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {!editing && !automaticName && !fixedIncomeEntry ? <Field label={entryType === "cash" ? "Cash name" : "Asset name"}><input aria-label={entryType === "cash" ? "Cash name" : "Asset name"} value={assetName} onChange={(event) => setAssetName(event.target.value)} autoComplete="off" placeholder={entryType === "cash" ? "For example, Savings account" : "For example, Bank X CDB"} className={inputClass} /></Field> : null}
                {automaticName && typedName ? <ReadOnly label="Asset" value={typedName} /> : null}
                {!editing && kind && entryType !== "cash" ? <ReadOnly label="Asset Class" value={allocationRows.length ? [...new Set(allocationRows.map((row) => englishLabel(row.assetClass)))].join(" / ") : "Unclassified"} /> : null}
                {!editing && kind && entryType !== "cash" ? <><ReadOnly label="Asset Type" value={productType(identity?.assetType ?? kind, identity?.exposure === "real-estate" && kind === "br-market" ? "FII" : identity?.instrumentType, fixedIncomeEntry ? fiProduct : null, null, allocationRows[0]?.subclass) || "Select the security to identify its product"} />{listingMarket(identity?.assetType ?? kind, baseCurrency ?? undefined) !== "Other Markets" ? <ReadOnly label="Market" value={listingMarket(identity?.assetType ?? kind, baseCurrency ?? undefined)} /> : null}</> : null}
                {identity && !identity.exposure ? <p role="alert" className="text-sm text-destructive">This fund cannot be added until its asset class has been identified.</p> : null}
                {fixedIncomeEntry ? <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Product"><Picker aria-label="Fixed-income product" searchable={false} value={fiProduct} options={["CDB", "LCI", "LCA"].map((value) => ({ value, label: value }))} onValueChange={(value) => setFiProduct(value as typeof fiProduct)} /></Field>
                    <Field label="Issuer"><input aria-label="Issuer" value={fiIssuer} onChange={(event) => setFiIssuer(event.target.value)} maxLength={40} placeholder="Itaú" className={inputClass} /></Field>
                    <Field label="Amount invested (BRL)"><input aria-label="Amount invested" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="10000.00" className={inputClass} /></Field>
                    <Field label="Purchase date"><DatePicker aria-label="Purchase date" value={appliedOn} onChange={setAppliedOn} max={latestPurchaseDay} /></Field>
                    <Field label="Maturity date"><DatePicker aria-label="Maturity date" value={maturity} onChange={setMaturity} min={appliedOn} /></Field>
                    <Field label="Return type"><Picker aria-label="Return type" searchable={false} value={fiIndexer} options={[{ value: "CDI", label: "Floating Rate · CDI" }, { value: "PRE", label: "Fixed Rate" }, { value: "IPCA", label: "Inflation Linked · IPCA+" }]} onValueChange={(value) => { setFiIndexer(value as typeof fiIndexer); setFiRate(""); }} /></Field>
                    <Field label={fiIndexer === "CDI" ? "Percentage of CDI (%)" : fiIndexer === "IPCA" ? "Annual yield above IPCA (%)" : "Annual yield (%)"}><input aria-label="Contracted rate" inputMode="decimal" value={fiRate} onChange={(event) => setFiRate(event.target.value)} placeholder={fiIndexer === "CDI" ? "105" : fiIndexer === "IPCA" ? "6.50" : "12.50"} className={inputClass} /></Field>
                    <Field label="Redemption"><Picker aria-label="Redemption" searchable={false} value={liquidity || "No vencimento"} options={[{ value: "No vencimento", label: "At maturity" }, { value: "D+0", label: "Daily liquidity" }]} onValueChange={setLiquidity} /></Field>
                  </div>
                  <p className="text-xs text-muted-foreground">{fiIndexer === "IPCA" ? "Gross reference balance · published IPCA only" : "Gross contractual accrual"}</p>
                </> : null}
                {purchaseEntry ? <>
                  {kind !== "treasury" ? <div role="group" aria-label="Trade side" className="flex gap-2">
                    {(["BUY", "SELL"] as const).map((next) => <Button key={next} type="button" variant={side === next ? "default" : "outline"} aria-pressed={side === next} onClick={() => setSide(next)}>{next === "BUY" ? "Buy" : "Sell"}</Button>)}
                  </div> : null}
                  {kind === "treasury" ? <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Purchase date"><DatePicker aria-label="Purchase date" value={purchaseDate} onChange={(day) => { if (day === purchaseDate) return; setPurchaseDate(day); setContractedRate(""); }} max={latestPurchaseDay} /></Field>
                      <Field label="Titles Purchased"><input aria-label="Quantity" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="10.60" className={inputClass} /></Field>
                      <Field label="Price per Title (BRL)"><input aria-label="Purchase price" inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="153.32" className={inputClass} /></Field>
                      <Field label={treasuryYieldLabel(selectedTreasury?.indexer)}><input aria-label="Contracted annual rate" inputMode="decimal" value={contractedRate} onChange={(event) => setContractedRate(event.target.value)} placeholder="7.23" className={inputClass} /></Field>
                    </div>
                  </> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={`${side === "SELL" ? "Sale" : "Purchase"} price (${tradeCurrency ?? "…"})`}><input aria-label={side === "SELL" ? "Sale price" : "Purchase price"} inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0.00" className={inputClass} /></Field>
                    <Field label="Quantity"><input aria-label="Quantity" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="10.60" className={inputClass} /></Field>
                    <Field label={`Commission (${tradeCurrency ?? "…"})`}><input aria-label="Commission" inputMode="decimal" value={commission} onChange={(event) => setCommission(event.target.value)} className={inputClass} /></Field>
                    <Field label="Trade date"><DatePicker aria-label="Trade date" value={purchaseDate} onChange={setPurchaseDate} max={latestPurchaseDay} /></Field>
                  </div>}
                </> : null}
                {kind === "treasury" ? <>
                  {selectedTreasury ? <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Security details</summary><div className="mt-3 flex flex-col gap-4">
                    <ReadOnly label="Current purchase price" value={selectedTreasury.purchasePrice ? formatPriceBrl(selectedTreasury.purchasePrice) : "Unavailable"} />
                    <ReadOnly label="Current gross redemption price" value={formatPriceBrl(selectedTreasury.valueBrl)} />
                    <ReadOnly label="Currently offered annual rate" value={selectedTreasury.offered === false ? "No longer offered for purchase" : `${treasuryIndexerLabel(selectedTreasury.indexer)} ${selectedTreasury.purchaseRate ?? "—"}%`} />
                    {selectedTreasury.paymentType === "M" ? <ReadOnly label="Income starts" value={String(selectedTreasury.targetYear)} /> : null}
                    <ReadOnly label="Final payment date" value={selectedTreasury.maturityDate.split("-").reverse().join("/")} />
                    {selectedTreasury.isin ? <ReadOnly label="ISIN" value={selectedTreasury.isin} mono /> : null}
                    <ReadOnly label="Quote date" value={selectedTreasury.quoteDate.split("-").reverse().join("/")} />
                  </div></details> : null}
                </> : null}
                {identity ? <ReadOnly label="Instrument type" value={identity.exposure === "real-estate" ? "Real Estate Fund" : identity.instrumentType.replace("EU_", "").replace("ACAO", "Stock")} /> : null}
                {purchaseEntry && (identity || kind === "crypto") ? <details key={verificationEpoch} className="rounded-xl border border-border p-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Details</summary>
                  <div className="mt-3 flex flex-col gap-4">
                    {identity ? <>
                      <ReadOnly label="Exchange" value={`${identity.exchange} · ${identity.currency}`} />
                      {identity.isin ? <ReadOnly label="ISIN" value={identity.isin} mono /> : null}
                      {identity.source.startsWith("https://") ? <a href={identity.source} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-4">Fund information</a> : null}
                    </> : null}
                    <ReadOnly label="Settlement" value={autoLiquidity?.replace("D+", "T+") ?? "Not specified"} />
                    {response?.status === "found" ? <p className="text-xs text-muted-foreground">Quote: {response.quoteDate} · {providerLabel(response.provider)}</p> : null}
                  </div>
                </details> : null}
                {!editing ? <div className="space-y-3 border-t border-border/60 pt-4">
                  {treasury && !purchaseEntry ? (
                    <Field label="Enter the position using">
                      <Picker
                        aria-label="Enter the position using"
                        options={[
                          { value: "quantity", label: "Number of securities" },
                          { value: "amount", label: "Position value (BRL)", hint: "account balance" },
                        ]}
                        value={valueKind}
                        onValueChange={(next) => setValueKind(next as "quantity" | "amount")}
                      />
                    </Field>
                  ) : null}
                  {!purchaseEntry && !fixedIncomeEntry ? <Field label={valueLabel}><input aria-label={valueLabel} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} className={cn(inputClass, "text-right font-mono")} /></Field> : null}
                  {purchaseEntry && tradeCurrency && parsedValue !== null && purchaseUnit !== null && purchaseFee !== null ? <p className="font-mono text-sm text-primary" data-testid="purchase-total">{side === "SELL" ? "Net proceeds" : kind === "treasury" ? "Total invested" : "Total cost"} {formatCurrency((parsedValue * purchaseUnit) + (side === "SELL" ? -purchaseFee : purchaseFee), tradeCurrency)} {kind !== "treasury" ? <span className="text-xs text-muted-foreground">{side === "SELL" ? "after commission" : "including commission"}</span> : null}</p> : !purchaseEntry && impliedQuantity !== null ? (
                    <p className="font-mono text-sm text-primary" data-testid="position-form-total">
                      {formatNumberText(impliedQuantity, 6)}securities <span className="text-[11px] text-muted-foreground">at a price of {formatPriceBrl(price ?? 0)}</span>
                    </p>
                  ) : !purchaseEntry && quoted && !amountMode && positionTotal !== null ? (
                    <p className="font-mono text-sm text-primary" data-testid="position-form-total">{formatBrl(positionTotal)} <span className="text-[11px] text-muted-foreground">{ownTreasuryPrice ? "using your price" : "using the verified quote"}</span></p>
                  ) : null}
                </div> : null}
                {!editing && entryType !== "cash" && !purchaseEntry && !fixedIncomeEntry && baseCurrency ? <ReadOnly label={kind && isMarketKind(kind) ? "Trading currency" : "Base currency"} value={baseCurrency} mono /> : null}


                {canEditMaturity && !fixedIncomeEntry && (editing || entryType !== "cash") ? (
                  <Field label="Maturity (optional)">
                    <DatePicker
                      aria-label="Maturity"
                      value={maturity}
                      min="2000-01-01"
                      max="2100-12-31"
                      onChange={setMaturity}
                      clearable
                    />
                  </Field>
                ) : null}
                {treasuryMaturity && !purchaseEntry ? <ReadOnly label="Security maturity" value={treasuryMaturity.split("-").reverse().join("/")} mono /> : null}

                {editing || (isNewAsset && !autoLiquidity && entryType !== "cash" && kind !== "treasury" && !fixedIncomeEntry) ? (
                  <Field label="Liquidity (optional)">
                    <LiquidityPicker value={liquidity} onChange={setLiquidity} />
                  </Field>
                ) : catalogAsset && !autoLiquidity && entryType !== "cash" && kind !== "treasury" && !fixedIncomeEntry ? (
                  <ReadOnly label="Asset liquidity" value={catalogAsset.liquidity ?? "Not specified"} />
                ) : null}
              </>
            )}
          </PositionSection>

          {editing ? <PositionSection single={false} value="rateio" className="outline-none">
            {!editing ? <SectionHeading title="Set the allocation" description="Classify this holding for your portfolio breakdown. Weights must add up to 100%." /> : null}
            {editing ? (
              <p className="text-[11px] leading-5 text-muted-foreground">Split the position across classifications. Weights must add up to 100%.
              </p>
            ) : null}
            <div className="mt-3 space-y-2.5">
              {allocationRows.map((row, index) => (
                <div key={row.key} className="rounded-xl border border-border/70 bg-background/30 p-3" data-allocation-row>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(row.assetClass) }} />
                    <span className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">Classification {index + 1}
                    </span>
                    {allocationRows.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove classification ${index + 1}`}
                        onClick={() => changeRows((current) => current.filter((entry) => entry.key !== row.key))}
                        className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <TrashIcon aria-hidden="true" size={13} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_88px]">
                    <Field label="Class">
                      <AllocationPicker
                        label={`Allocation class ${index + 1}`}
                        values={ASSET_CLASSES}
                        value={row.assetClass}
                        onChange={(next) => updateRow(row.key, "assetClass", next)}
                      />
                    </Field>
                    <Field label="Subclass">
                      <AllocationPicker
                        label={`Allocation subclass ${index + 1}`}
                        values={subclassesOf(row.assetClass)}
                        value={row.subclass}
                        onChange={(next) => updateRow(row.key, "subclass", next)}
                        placeholder={row.assetClass ? "Choose" : "Choose the class"}
                        disabled={!row.assetClass}
                      />
                    </Field>
                    <Field label="Redemption term">
                      <RedemptionPicker
                        label={`Allocation redemption term ${index + 1}`}
                        values={redemptionsOf(row.assetClass)}
                        value={row.duration}
                        onChange={(next) => updateRow(row.key, "duration", next)}
                        disabled={!row.assetClass}
                      />
                    </Field>
                    <Field label="Weight (%)">
                      <input
                        aria-label={`Allocation weight ${index + 1}`}
                        inputMode="decimal"
                        value={row.weight}
                        onChange={(event) => updateRow(row.key, "weight", event.target.value)}
                        className={cn(inputClass, "text-right font-mono")}
                      />
                    </Field>
                  </div>
                  {rowIndexer(row) ? (
                    <RateField
                      index={index}
                      indexer={rowIndexer(row)!}
                      value={row.rate}
                      onChange={(next) => updateRow(row.key, "rate", next)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                changeRows((current) => [
                  ...current,
                  {
                    key: nextRowKey,
                    assetClass: "",
                    subclass: "",
                    duration: "",
                    weight: formatWeight(Math.max(100 - weightSum, 0)),
                    rate: "",
                  },
                ]);
                setNextRowKey((key) => key + 1);
              }}
              className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PlusIcon aria-hidden="true" size={13} weight="bold" />Add classification
            </button>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={cn("h-full rounded-full transition-[width] duration-200", balanced ? "bg-primary" : "bg-warning-foreground")}
                style={{ width: `${Math.min(weightSum, 100)}%` }}
              />
            </div>
            <p
              aria-live="polite"
              className={cn("mt-2 text-xs font-medium", balanced ? "text-primary" : "text-warning-foreground")}
            >Sum: {formatWeight(weightSum)}%
              {balanced ? "" : weightSum < 100 ? ` · faltam ${formatWeight(100 - weightSum)}%` : ` · sobram ${formatWeight(weightSum - 100)}%`}
            </p>
            {incomeAvailable ? (
              <AutoIncomeToggle
                automatic={autoIncome}
                onAutomaticChange={setAutoIncome}
                appliedOn={editing ? null : appliedOn}
                onAppliedOnChange={setAppliedOn}
              />
            ) : null}
          </PositionSection> : null}

          </>}
        </div>
      </Tabs.Root>


      <footer
        data-issue-count={bondEntry ? bondIssues.length : issues.length}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 px-5 py-4 sm:px-6"
      >
        <div className="min-w-0 flex-1 basis-56" aria-live="polite">
          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] leading-snug text-destructive">
              <XCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
              {error}
            </p>
          ) : !editing ? (
            <div className="space-y-1.5" data-testid="position-form-progress">
              <p className={cn("flex items-center gap-1.5 text-[11px]", ready ? "text-primary" : "text-destructive")}>
                {ready ? <CheckCircleIcon aria-hidden="true" size={13} weight="fill" /> : <WarningCircleIcon aria-hidden="true" size={13} />}
                {ready ? "Ready to add" : activeIssues.length ? `${activeIssues.length} required ${activeIssues.length === 1 ? "field" : "fields"} remaining` : "Review the details"}
              </p>
            </div>
          ) : visibleIssue ? (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-warning-foreground" data-testid="position-form-issue">
              <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
              {englishLabel(TABS.find((entry) => entry.key === visibleIssue.tab)?.label)}: {visibleIssue.message}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          <Dialog.Close className={secondaryButtonClass} disabled={busy}>Cancel</Dialog.Close>
          <button type={bondEntry ? "submit" : "button"} form={bondEntry ? bondFormId : undefined} onClick={bondEntry ? undefined : submit} disabled={busy || (!editing && !ready) || Boolean(identity && !identity.exposure)} className={primaryButtonClass}>
            {busy ? <CircleNotchIcon aria-hidden="true" className="animate-spin" size={14} weight="bold" /> : null}
            {busy ? "Saving…" : editing ? "Save" : purchaseEntry ? kind === "treasury" ? "Add purchase" : "Record trade" : "Add position"}
          </button>
        </div>
      </footer>
    </FieldFeedbackProvider>
  );
}

function SectionHeading({ title, description }: { title: string; description: string | null }) {
  return <div className="mb-4"><h2 className="text-base font-semibold">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}</div>;
}

function PositionSection({ single, value, className, children }: { single: boolean; value: string; className?: string; children: ReactNode }) {
  return single ? <section className={cn("mb-5", className)}>{children}</section> : <Tabs.Panel value={value} className={className}>{children}</Tabs.Panel>;
}

function ReadOnly({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(label)}</span>
      <p
        className={cn(
          "flex h-9 items-center truncate rounded-lg border border-border/60 bg-white/[0.02] px-2.5 text-xs text-foreground/80",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}


function allowsMaturityOf(position: Pick<MonthPosition, "quoteSymbol">) {
  return !position.quoteSymbol || position.quoteSymbol === USD_SYMBOL;
}

function editableValue(position: MonthPosition) {
  return (position.quoteSymbol ? position.quantityText : position.totalBrl.toFixed(2));
}

function formatWeight(value: number) {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 4, useGrouping: false });
}


type TickerCheckState = (
  | { state: "idle" }
  | { state: "checking" }
  | { state: "error"; retry: () => void }
  | { state: "done"; response: TickerCheckResponse }
) & { refresh: () => void };


function useTickerCheck(
  monthId: string,
  kind: AssetKind | null,
  symbol: string | null,
  coinId: string | null,
  epoch: number,
): TickerCheckState {
  const key = kind && symbol ? `${epoch}:${kind}:${symbol}:${coinId ?? ""}` : null;
  const [result, setResult] = useState<{ key: string; response: TickerCheckResponse | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !kind || !symbol) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quotes/ticker-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ monthId, kind, ticker: symbol, ...(coinId ? { coinId } : {}) }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as TickerCheckResponse | null;
        if (!controller.signal.aborted) setResult({ key, response: payload && "status" in payload ? payload : null });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ key, response: null });
        }
      }
    }, CHECK_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, kind, symbol, coinId, monthId, attempt]);

  const refresh = () => { setResult(null); setAttempt((value) => value + 1); };
  if (!key) {
    return { state: "idle", refresh };
  }

  if (result?.key !== key) {
    return { state: "checking", refresh };
  }

  if (!result.response) {
    return {
      state: "error",
      retry: refresh,
      refresh,
    };
  }

  return { state: "done", response: result.response, refresh };
}

function TickerStatus({
  kind,
  text,
  symbol,
  check,
  monthLabel,
  isCurrent,
}: {
  kind: AssetKind;
  text: string;
  symbol: string | null;
  check: TickerCheckState;
  monthLabel: string;
  isCurrent: boolean;
}) {
  const provider = providerLabel(isMarketKind(kind) ? "yahoo" : ASSET_KIND_DEFINITIONS[kind].provider ?? "provider");
  let content: ReactNode;

  if (!text.trim()) {
    content = <StatusLine tone="muted">{tickerHint(kind)}</StatusLine>;

  } else if (!symbol && ASSET_KIND_DEFINITIONS[kind].provider === "yahoo" && /^[A-Z0-9]{1,4}$/.test(text.trim())) {

    content = <StatusLine tone="muted">Enter the complete ticker, such as PETR4 or GPCA11.</StatusLine>;
  } else if (!symbol) {
    content = <StatusLine tone="error">Invalid ticker for {englishLabel(ASSET_KIND_DEFINITIONS[kind].label)}.</StatusLine>;
  } else if (check.state === "checking" || check.state === "idle") {
    content = <StatusLine tone="checking">{kind === "treasury" ? "Verifying security…" : <>Verifying {symbol} with {provider}…</>}</StatusLine>;
  } else if (check.state === "error") {
    content = (
      <StatusLine tone="warning">Could not verify the ticker right now.{" "}
        <button
          type="button"
          onClick={check.retry}
          className="inline-flex items-center gap-1 font-semibold underline-offset-2 outline-none hover:underline focus-visible:underline"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={11} weight="bold" />Try again
        </button>
      </StatusLine>
    );
  } else {
    const response = check.response;

    switch (response.status) {
      case "matches":
        content = <StatusLine tone="muted">No unambiguous EUR listing was found. Check the trading currency and select your investment.</StatusLine>;
        break;
      case "found":
        if (isMarketKind(kind) || kind === "crypto" || kind === "treasury") {
          content = <StatusLine tone="success">Verified</StatusLine>;
          break;
        }
        content = (
          <StatusLine tone="success">
            {symbol} found{response.name ? ` (${response.name})` : ""} on {providerLabel(response.provider)}:{" "}
            {formatPriceBrl(response.priceBrl)} · {response.quoteDate}.
            {isCurrent ? null : ` Enter the quote for ${monthLabel}.`}
          </StatusLine>
        );
        break;
      case "known":
        if (kind === "treasury") {
          content = <StatusLine tone="success">Verified</StatusLine>;
          break;
        }
        content = (
          <StatusLine tone="success">
            {symbol}already has a quote in this reporting month: {formatPriceBrl(response.priceBrl)}.
          </StatusLine>
        );
        break;
      case "unavailable":
        content = (
          <StatusLine tone="warning">
            {providerLabel(response.provider)}unavailable: {response.message}Enter a quote to save.
          </StatusLine>
        );
        break;
      case "not-found":
      case "conflict":
      case "invalid":
        content = <StatusLine tone="error">{response.message}</StatusLine>;
        break;
    }
  }

  return (
    <div aria-live="polite" data-ticker-status={check.state === "done" ? check.response.status : check.state}>
      {content}
    </div>
  );
}

function StatusLine({
  tone,
  children,
}: {
  tone: "muted" | "checking" | "success" | "warning" | "error";
  children: ReactNode;
}) {
  const icon =
    tone === "checking" ? (
      <CircleNotchIcon aria-hidden="true" className="mt-px shrink-0 animate-spin" size={13} weight="bold" />
    ) : tone === "success" ? (
      <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
    ) : tone === "warning" ? (
      <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
    ) : tone === "error" ? (
      <XCircleIcon aria-hidden="true" className="mt-px shrink-0" size={13} weight="fill" />
    ) : null;

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[11px] leading-snug",
        tone === "success" && "text-primary",
        tone === "warning" && "text-warning-foreground",
        tone === "error" && "text-destructive",
        (tone === "muted" || tone === "checking") && "text-muted-foreground",
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  );
}

const NUMBER_TEXT_FORMATS = new Map<number, Intl.NumberFormat>();


function formatNumberText(value: number, digits = 8) {
  let format = NUMBER_TEXT_FORMATS.get(digits);

  if (!format) {
    format = new Intl.NumberFormat("en-GB", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
    NUMBER_TEXT_FORMATS.set(digits, format);
  }

  return format.format(value);
}


function defaultAppliedOn() {
  return new Date().toISOString().slice(0, 10);
}


function RateField({
  index,
  indexer,
  value,
  onChange,
}: {
  index: number;
  indexer: AutoIncomeIndexer;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3" data-testid="allocation-rate">
      <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Rate of return</span>
      <label className="relative block w-36 shrink-0">
        <input
          aria-label={`Allocation rate of return ${index + 1}`}
          inputMode="decimal"
          value={value}
          placeholder={indexer === "CDI" ? "100" : "12,5"}
          onChange={(event) => onChange(event.target.value)}
          className={cn(inputClass, "h-8 pr-14 text-right font-mono")}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[10px] text-muted-foreground">
          {indexer === "CDI" ? "% CDI" : "% p.a."}
        </span>
      </label>
    </div>
  );
}


function AutoIncomeToggle({
  automatic,
  onAutomaticChange,
  appliedOn,
  onAppliedOnChange,
}: {
  automatic: boolean;
  onAutomaticChange: (value: boolean) => void;
  appliedOn: string | null;
  onAppliedOnChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-testid="auto-income">
      <label className="flex cursor-pointer items-center gap-2.5 text-xs text-foreground">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(event) => onAutomaticChange(event.target.checked)}
          className="size-4 shrink-0 accent-primary"
        />Calculate accrual automatically
      </label>
      {automatic && appliedOn !== null ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">Invested on</span>
          <div className="w-40">

            <DatePicker aria-label="Investment date" value={appliedOn} min="2000-01-01" max={defaultAppliedOn()} onChange={onAppliedOnChange} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
