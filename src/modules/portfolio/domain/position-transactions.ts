



export const TRANSACTION_KINDS = ["CONTRIBUTION", "WITHDRAWAL", "INCOME"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];


export type StoredTransactionKind = TransactionKind | "OPENING";

export const TRANSACTION_LABELS: Record<StoredTransactionKind, string> = {
  OPENING: "Opening Balance",
  CONTRIBUTION: "Contribution",
  WITHDRAWAL: "Withdrawal",
  INCOME: "Return",
};


export type RecordedMonth = {

  netFlowBrl: number;
  contributionsBrl: number;
  withdrawalsBrl: number;
  incomeBrl: number;

  capitalizedIncomeBrl: number;
  openingBrl: number;

  internalBrl: number;

  quantityDelta: number;

  openingQuantity: number;

  movements: RecordedMovement[];
  count: number;
};

export type RecordedMovement = {
  kind: StoredTransactionKind;
  amountBrl: number;
  quantity?: number;
  transferId: string | null;
  occurredOn?: string;
};

export function emptyRecordedMonth(): RecordedMonth {
  return {
    netFlowBrl: 0,
    contributionsBrl: 0,
    withdrawalsBrl: 0,
    incomeBrl: 0,
    capitalizedIncomeBrl: 0,
    openingBrl: 0,
    internalBrl: 0,
    quantityDelta: 0,
    openingQuantity: 0,
    movements: [],
    count: 0,
  };
}


export function recordedByMonth(
  transactions: (RecordedMovement & { month: string })[],
) {
  const months = new Map<string, RecordedMonth>();

  for (const entry of transactions) {
    const month = months.get(entry.month) ?? emptyRecordedMonth();
    month.count += 1;
    month.movements.push(entry);

    if (entry.kind === "CONTRIBUTION") {
      if (entry.transferId) {
        month.internalBrl += entry.amountBrl;
      } else {
        month.contributionsBrl += entry.amountBrl;
        month.netFlowBrl += entry.amountBrl;
      }
    } else if (entry.kind === "WITHDRAWAL") {
      if (entry.transferId) {
        month.internalBrl -= entry.amountBrl;
      } else {
        month.withdrawalsBrl += entry.amountBrl;
        month.netFlowBrl -= entry.amountBrl;
      }
    } else if (entry.kind === "INCOME") {
      month.incomeBrl += entry.amountBrl;
      if (entry.quantity !== undefined && entry.quantity !== 0) {
        month.capitalizedIncomeBrl += entry.amountBrl;
      }
    } else {
      month.openingBrl += entry.amountBrl;
      month.openingQuantity += entry.quantity ?? 0;
    }

    if (entry.kind !== "OPENING") {
      const sign = entry.kind === "WITHDRAWAL" || entry.amountBrl < 0 ? -1 : 1;
      month.quantityDelta += sign * (entry.quantity ?? 0);
    }

    months.set(entry.month, month);
  }

  for (const month of months.values()) {


    month.movements.sort((left, right) => (left.occurredOn ?? "").localeCompare(right.occurredOn ?? ""));
    for (const key of ["netFlowBrl", "contributionsBrl", "withdrawalsBrl", "incomeBrl", "capitalizedIncomeBrl", "openingBrl", "internalBrl"] as const) {
      month[key] = round(month[key], 2);
    }
  }

  return months;
}


export type PositionValueKind = "quoted" | "balance";


export function quantityDelta(kind: StoredTransactionKind, quantity: number) {
  return kind === "WITHDRAWAL" ? -quantity : quantity;
}

export type TrioField = "quantity" | "unitPrice" | "amount";


export type MovementMode = "operation" | "total";
export type TotalTarget = "quantity" | "marketValue";

export type MovementInput = {
  kind: StoredTransactionKind;
  mode: MovementMode;
  totalTarget: TotalTarget;

  quoted: boolean;
  current: { quantity: number; marketPrice: number | null };

  typed: { quantity: number | null; unitPrice: number | null; amount: number | null; total: number | null };

  order: TrioField[];
};

export type MovementPlan = {
  kind: StoredTransactionKind;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;

  computed: TrioField[];

  suggestedPrice: boolean;

  cashIncome: boolean;

  after: number;

  issue: string | null;
};

const MONEY_TOLERANCE = 0.01;


export function resolveMovement(input: MovementInput): MovementPlan {
  const { current, typed, quoted } = input;
  let kind = input.kind;
  let quantity: number | null = null;
  let unitPrice: number | null = null;
  let amount: number | null = null;
  const computed: TrioField[] = [];
  let suggestedPrice = false;
  let issue: string | null = null;
  const positive = (value: number | null) => value !== null && Number.isFinite(value) && value > 0;
  const nonNegative = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0;


  const activeFields = input.order.filter((field) =>
    input.mode === "total"
      ? quoted && kind !== "OPENING" && field === "unitPrice"
      : quoted || field === "amount",
  );
  const invalidField = activeFields.find((field) =>
    !positive(typed[field]) && !(field === "quantity" && kind === "INCOME" && typed[field] === 0),
  );

  if (invalidField) {
    const labels: Record<TrioField, string> = { quantity: "the quantity", unitPrice: "the execution price", amount: "the transaction amount" };
    return {
      kind,
      quantity: quoted ? typed.quantity : typed.amount,
      unitPrice: quoted ? typed.unitPrice : null,
      amount: typed.amount,
      computed: [],
      suggestedPrice: false,
      cashIncome: false,
      after: current.quantity,
      issue: `Review ${labels[invalidField]}: use a valid number greater than zero${invalidField === "quantity" && kind === "INCOME" ? ", or zero for cash received without units" : ""}.`,
    };
  }

  const price = () => {
    if (positive(typed.unitPrice)) {
      return typed.unitPrice;
    }

    if (positive(current.marketPrice)) {
      suggestedPrice = true;
      return current.marketPrice;
    }

    return null;
  };

  if (input.mode === "total") {

    const target =
      !quoted || input.totalTarget === "quantity"
        ? typed.total
        : nonNegative(typed.total) && positive(current.marketPrice)
          ? typed.total! / current.marketPrice!
          : null;

    if (target === null || !Number.isFinite(target) || target < 0) {
      issue = quoted && input.totalTarget === "marketValue" ? "Enter the new market value." : "Enter the new position total.";
    } else {
      const difference = round(target - current.quantity, quoted ? 12 : 2);

      if (difference === 0) {
        issue = "The new total is the same as the current total.";
      } else if (kind === "OPENING") {
        issue = difference < 0 ? "The opening balance cannot be negative." : null;
      } else if (difference < 0) {
        kind = "WITHDRAWAL";
      } else if (kind === "WITHDRAWAL") {
        kind = "CONTRIBUTION";
      }

      quantity = Math.abs(difference);

      if (quoted) {
        unitPrice = kind === "OPENING" ? null : price();


        const valuationPrice = kind === "OPENING" ? current.marketPrice : unitPrice;
        amount = positive(valuationPrice) ? round(quantity * valuationPrice!, 2) : null;
        if (unitPrice === null && kind !== "OPENING") {
          issue ??= "Enter the execution price.";
        } else if (amount === null) {
          issue ??= "The position needs a valid quote to calculate its value.";
        }
        computed.push("quantity", "amount");
      } else {
        amount = quantity;
        computed.push("amount");
      }
    }
  } else if (!quoted) {
    amount = positive(typed.amount) ? typed.amount : null;
    quantity = amount;
    issue = amount === null ? "Enter the amount." : null;
  } else if (kind === "INCOME" && !positive(typed.quantity)) {

    amount = positive(typed.amount) ? typed.amount : null;
    quantity = 0;
    issue = amount === null ? "Enter the amount received." : null;
  } else {
    const known = input.order.filter((field) => positive(typed[field]));

    if (known.length >= 3) {
      quantity = typed.quantity;
      unitPrice = typed.unitPrice;
      amount = typed.amount;

      if (Math.abs(quantity! * unitPrice! - amount!) > MONEY_TOLERANCE + amount! * 1e-6) {
        issue = `Quantity × price equals ${formatPlain(quantity! * unitPrice!)}, which differs from the entered amount. Clear one of the three fields to let the application calculate it.`;
      }
    } else {
      const values = { quantity: typed.quantity, unitPrice: typed.unitPrice, amount: typed.amount };

      if (known.length === 1 && known[0] !== "unitPrice") {
        values.unitPrice = price();
        known.push("unitPrice");
      }

      if (known.length < 2) {
        issue = known[0] === "unitPrice" || !positive(current.marketPrice) ? "Enter the quantity or transaction amount." : "Enter the quantity or amount.";
        quantity = values.quantity;
        unitPrice = values.unitPrice;
        amount = values.amount;
      } else {
        const result = completeTrio(values, known);
        quantity = result.quantity;
        unitPrice = result.unitPrice;
        amount = result.amount;

        if (result.computed) {
          computed.push(result.computed);
        }
      }
    }
  }

  const cashIncome = quoted && kind === "INCOME" && quantity === 0;
  const delta = quantity ? quantityDelta(kind, quantity) : 0;
  const after = round(current.quantity + delta, quoted ? 12 : 2);

  if (!issue && after < 0) {
    issue = "The withdrawal exceeds the position.";
  }

  if (!issue && [quantity, unitPrice, amount, after].some((value) => value !== null && !Number.isFinite(value))) {
    issue = "Values exceed the calculation limit. Review the entered numbers.";
  } else if (!issue && amount !== null && amount <= 0) {
    issue = "The transaction amount must be greater than zero.";
  }

  return { kind, quantity, unitPrice, amount, computed, suggestedPrice, cashIncome, after, issue };
}


export function completeTrio(
  values: { quantity: number | null; unitPrice: number | null; amount: number | null },
  order: TrioField[],
) {
  const known = order.filter((field) => {
    const value = values[field];
    return value !== null && Number.isFinite(value) && value > 0;
  });
  const [first, second] = known;

  if (!first || !second) {
    return { ...values, computed: null as TrioField | null };
  }

  const computed = (["quantity", "unitPrice", "amount"] as const).find((field) => field !== first && field !== second)!;
  const next = { ...values };

  if (computed === "amount") {
    next.amount = round(values.quantity! * values.unitPrice!, 2);
  } else if (computed === "unitPrice") {
    next.unitPrice = round(values.amount! / values.quantity!, 8);
  } else {
    next.quantity = round(values.amount! / values.unitPrice!, 12);
  }

  return { ...next, computed };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPlain(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "BRL" }).format(value);
}
