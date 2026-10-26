import { liquidityLabel, compareLiquidityLabels, LIQUIDITY_NOT_SPECIFIED } from "@/lib/liquidity-labels";
import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";
import { englishLabel } from "@/lib/english-labels";
import { PRODUCT_TYPES, productType, listingMarket } from "./asset-classification";

export const NO_CLASS = "Unclassified";
export const NO_MATURITY = "No Maturity Date";
export const NO_LIQUIDITY = LIQUIDITY_NOT_SPECIFIED;

export type PositionFilters = {
  classes: string[];
  subclasses: string[];

  types: string[];
  markets?: string[];
  currencies: string[];

  maturities: string[];

  liquidities: string[];
  search: string;
};

export type FilterDimension =
  | "classes"
  | "markets"
  | "types"
  | "currencies"
  | "maturities"
  | "liquidities";

export const FILTER_DIMENSIONS: FilterDimension[] = [
  "classes",
  "types",
  "markets",
  "currencies",
  "maturities",
  "liquidities",
];

export function normalizeTypeFilter(label: string) {
  if (["REIT", "FII", "REIT / FII"].includes(label)) return "REIT/FII";
  if (["Government Bond", "Corporate Bond", "Agency Bond", "Municipal Bond", "Supranational Bond", "Negotiable CD", "Covered Bond", "Securitized Bond", "Bond"].includes(label)) return "Bonds";
  return (PRODUCT_TYPES as readonly string[]).includes(label) ? label : "";
}

export function typeOf(position: Pick<MonthPosition, "assetType" | "productType">) {
  return normalizeTypeFilter(position.productType ?? productType(position.assetType));
}

export function marketOf(position: Pick<MonthPosition, "assetType" | "market" | "baseCurrency">) {
  return position.market ?? listingMarket(position.assetType, position.baseCurrency);
}

/** Legacy multi-class holdings use their largest saved exposure as the visual marker. */
export function primaryClassOf(position: Pick<MonthPosition, "allocations">) {
  return [...position.allocations].sort((left, right) => right.weight - left.weight || left.assetClass.localeCompare(right.assetClass))[0]?.assetClass ?? NO_CLASS;
}

export function classesOf(position: MonthPosition) {
  return position.allocations.length === 0
    ? [NO_CLASS]
    : [...new Set(position.allocations.map((allocation) => allocation.assetClass))];
}


export function allocationLabel(allocation: { assetClass: string; subclass: string; duration: string }) {
  return [allocation.assetClass, allocation.subclass, allocation.duration !== "-" ? allocation.duration : null]
    .filter(Boolean)
    .map((part) => englishLabel(part))
    .join(" · ");
}

export function subclassesOf(position: MonthPosition) {
  return [...new Set(position.allocations.map((allocation) => allocation.subclass))];
}


export function liquidityOf(position: MonthPosition) {
  return liquidityLabel(position.liquidity);
}


export function maturityOf(position: MonthPosition) {
  return position.maturityDate ? position.maturityDate.slice(0, 4) : NO_MATURITY;
}

export function hasClassFilter(filters: PositionFilters) {
  return filters.classes.length > 0 || filters.subclasses.length > 0;
}

export function filterPositions<T extends MonthPosition>(positions: T[], filters: PositionFilters): T[] {
  const search = normalize(filters.search);

  return positions.filter((position) => {
    if (filters.types.length > 0 && !filters.types.includes(typeOf(position))) {
      return false;
    }

    if (filters.markets?.length && !filters.markets.includes(marketOf(position))) return false;

    if (filters.currencies.length > 0 && !filters.currencies.includes(position.valueCurrency)) {
      return false;
    }

    if (filters.maturities.length > 0 && !filters.maturities.includes(maturityOf(position))) {
      return false;
    }

    if (filters.liquidities.length > 0 && !filters.liquidities.map(liquidityLabel).includes(liquidityOf(position))) {
      return false;
    }

    if (
      filters.classes.length > 0 &&
      !classesOf(position).some((assetClass) => filters.classes.includes(assetClass))
    ) {
      return false;
    }

    if (
      filters.subclasses.length > 0 &&
      !subclassesOf(position).some((subclass) => filters.subclasses.includes(subclass))
    ) {
      return false;
    }

    if (search) {
      const haystack = normalize(
        [position.assetName, position.ticker ?? ""].join(" "),
      );

      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });
}

export function matchedValueBrl(position: MonthPosition, filters: PositionFilters) {
  if (!hasClassFilter(filters)) {
    return position.totalBrl;
  }

  if (position.allocations.length === 0) {
    return filters.classes.includes(NO_CLASS) && filters.subclasses.length === 0
      ? position.totalBrl
      : 0;
  }

  const weight = position.allocations
    .filter(
      (allocation) =>
        (filters.classes.length === 0 || filters.classes.includes(allocation.assetClass)) &&
        (filters.subclasses.length === 0 || filters.subclasses.includes(allocation.subclass)),
    )
    .reduce((total, allocation) => total + allocation.weight, 0);

  return (position.totalBrl * weight) / 100;
}

export function filterOptions(
  positions: MonthPosition[],
  filters: PositionFilters = EMPTY_FILTERS,
): Record<FilterDimension, string[]> {
  const options = {} as Record<FilterDimension, string[]>;

  for (const [index, dimension] of FILTER_DIMENSIONS.entries()) {
    const before = FILTER_DIMENSIONS.slice(0, index).filter((other) => (filters[other]?.length ?? 0) > 0);
    const scoped: PositionFilters = { ...EMPTY_FILTERS, search: filters.search };

    for (const other of before) {
      scoped[other] = filters[other] ?? [];
    }

    const values = filterPositions(positions, scoped).flatMap((position) => facetValues(position, dimension, scoped));
    const supported = dimension === "types" ? [...PRODUCT_TYPES] : dimension === "currencies" ? ["BRL", "USD", "EUR"] : dimension === "markets" ? ["Brazil", "United States", "Europe", "Global"] : [];
    options[dimension] = [...new Set(dimension === "types" ? [...PRODUCT_TYPES] : [...supported, ...values.filter(Boolean), ...(dimension === "liquidities" ? (filters.liquidities ?? []).map(liquidityLabel) : filters[dimension] ?? [])])].sort((left, right) =>
      dimension === "liquidities" ? compareLiquidityLabels(left, right) : left.localeCompare(right, "en-GB"),
    );
  }

  return options;
}

const EMPTY_FILTERS: PositionFilters = {
  classes: [],
  subclasses: [],
  types: [],
  markets: [],
  currencies: [],
  maturities: [],
  liquidities: [],
  search: "",
};


function facetValues(position: MonthPosition, dimension: FilterDimension, scoped: PositionFilters) {
  switch (dimension) {
    case "classes":
      return position.allocations.length === 0
        ? [NO_CLASS]
        : position.allocations
            .filter((allocation) => scoped.subclasses.length === 0 || scoped.subclasses.includes(allocation.subclass))
            .map((allocation) => allocation.assetClass);
    case "markets":
      return [marketOf(position)];
    case "types":
      return [typeOf(position)];
    case "currencies":
      return [position.valueCurrency];
    case "maturities":
      return [maturityOf(position)];
    case "liquidities":
      return [liquidityOf(position)];
  }
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en-GB")
    .trim();
}
