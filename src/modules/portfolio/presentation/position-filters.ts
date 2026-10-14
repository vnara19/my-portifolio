import type { MonthPosition } from "@/modules/portfolio/application/get-month-positions";
import { ASSET_TYPE_LABELS } from "@/modules/portfolio/domain/classification";

export const NO_CLASS = "Unclassified";
export const NO_STRATEGY = "No strategy";
export const NO_MATURITY = "No maturity date";
export const NO_LIQUIDITY = "Liquidity not specified";

export type PositionFilters = {
  classes: string[];
  subclasses: string[];

  types: string[];
  institutions: string[];
  strategies: string[];
  currencies: string[];

  maturities: string[];

  liquidities: string[];
  search: string;
};

export type FilterDimension =
  | "classes"
  | "subclasses"
  | "types"
  | "institutions"
  | "strategies"
  | "currencies"
  | "maturities"
  | "liquidities";

export const FILTER_DIMENSIONS: FilterDimension[] = [
  "classes",
  "subclasses",
  "types",
  "institutions",
  "strategies",
  "currencies",
  "maturities",
  "liquidities",
];

export type GroupBy = "instituicao" | "classe" | "tipo";

export type GroupedPosition<T extends MonthPosition = MonthPosition> = {
  position: T;
  valueBrl: number;
};

export type PositionGroup<T extends MonthPosition = MonthPosition> = {
  key: string;
  label: string;
  items: GroupedPosition<T>[];
  totalBrl: number;
};


export function typeOf(position: MonthPosition) {
  return ASSET_TYPE_LABELS[position.assetType];
}

export function strategyOf(position: MonthPosition) {
  return position.strategy ?? NO_STRATEGY;
}

export function classesOf(position: MonthPosition) {
  return position.allocations.length === 0
    ? [NO_CLASS]
    : [...new Set(position.allocations.map((allocation) => allocation.assetClass))];
}


export function allocationLabel(allocation: { assetClass: string; subclass: string; duration: string }) {
  return [allocation.assetClass, allocation.subclass, allocation.duration !== "-" ? allocation.duration : null]
    .filter(Boolean)
    .join(" · ");
}

export function subclassesOf(position: MonthPosition) {
  return [...new Set(position.allocations.map((allocation) => allocation.subclass))];
}


export function liquidityOf(position: MonthPosition) {
  return position.liquidity ?? NO_LIQUIDITY;
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
    if (filters.institutions.length > 0 && !filters.institutions.includes(position.institutionName)) {
      return false;
    }

    if (filters.types.length > 0 && !filters.types.includes(typeOf(position))) {
      return false;
    }

    if (filters.strategies.length > 0 && !filters.strategies.includes(strategyOf(position))) {
      return false;
    }

    if (filters.currencies.length > 0 && !filters.currencies.includes(position.baseCurrency)) {
      return false;
    }

    if (filters.maturities.length > 0 && !filters.maturities.includes(maturityOf(position))) {
      return false;
    }

    if (filters.liquidities.length > 0 && !filters.liquidities.includes(liquidityOf(position))) {
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
        [position.assetName, position.ticker ?? "", position.institutionName].join(" "),
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

export function groupPositions<T extends MonthPosition>(
  positions: T[],
  groupBy: GroupBy,
  filters: PositionFilters,
): PositionGroup<T>[] {
  const groups = new Map<string, PositionGroup<T>>();

  const add = (label: string, item: GroupedPosition<T>) => {
    const group = groups.get(label) ?? { key: label, label, items: [], totalBrl: 0 };
    group.items.push(item);
    group.totalBrl += item.valueBrl;
    groups.set(label, group);
  };

  for (const position of positions) {
    if (groupBy === "instituicao" || groupBy === "tipo") {
      add(groupBy === "tipo" ? typeOf(position) : position.institutionName, { position, valueBrl: position.totalBrl });
      continue;
    }

    if (position.allocations.length === 0) {
      add(NO_CLASS, { position, valueBrl: position.totalBrl });
      continue;
    }

    for (const assetClass of classesOf(position)) {
      if (filters.classes.length > 0 && !filters.classes.includes(assetClass)) {
        continue;
      }

      const weight = position.allocations
        .filter(
          (allocation) =>
            allocation.assetClass === assetClass &&
            (filters.subclasses.length === 0 || filters.subclasses.includes(allocation.subclass)),
        )
        .reduce((total, allocation) => total + allocation.weight, 0);

      if (weight > 0) {
        add(assetClass, { position, valueBrl: (position.totalBrl * weight) / 100 });
      }
    }
  }

  return [...groups.values()].sort((left, right) => right.totalBrl - left.totalBrl);
}


export function filterOptions(
  positions: MonthPosition[],
  filters: PositionFilters = EMPTY_FILTERS,
): Record<FilterDimension, string[]> {
  const options = {} as Record<FilterDimension, string[]>;

  for (const [index, dimension] of FILTER_DIMENSIONS.entries()) {
    const before = FILTER_DIMENSIONS.slice(0, index).filter((other) => filters[other].length > 0);
    const scoped: PositionFilters = { ...EMPTY_FILTERS, search: filters.search };

    for (const other of before) {
      scoped[other] = filters[other];
    }

    const values = filterPositions(positions, scoped).flatMap((position) => facetValues(position, dimension, scoped));
    options[dimension] = [...new Set([...values, ...filters[dimension]])].sort((left, right) =>
      left.localeCompare(right, "en-GB"),
    );
  }

  return options;
}

const EMPTY_FILTERS: PositionFilters = {
  classes: [],
  subclasses: [],
  types: [],
  institutions: [],
  strategies: [],
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
    case "subclasses":
      return position.allocations
        .filter((allocation) => scoped.classes.length === 0 || scoped.classes.includes(allocation.assetClass))
        .map((allocation) => allocation.subclass);
    case "types":
      return [typeOf(position)];
    case "institutions":
      return [position.institutionName];
    case "strategies":
      return [strategyOf(position)];
    case "currencies":
      return [position.baseCurrency];
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
