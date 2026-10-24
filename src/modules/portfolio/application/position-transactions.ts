
/** Apply or undo transactions atomically to the open month. Reject negative balances and mismatched ownership. */
import { PositionTransactionKind, Prisma } from "@/generated/prisma/client";
import { SCOPED_USER } from "@/lib/user-db";
import { valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { foldCalculatedIncome, MonthEditError, parseDecimal, withUndo } from "@/modules/portfolio/application/month-editing";
import { WITHDRAWAL_ABOVE_BALANCE } from "@/modules/portfolio/domain/cdi-valuation";
import type { TransactionKind } from "@/modules/portfolio/domain/position-transactions";
import { calendarDay, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";


type Transaction = Prisma.TransactionClient;

export type TransactionInput = {
  positionId: string;
  kind: TransactionKind;

  occurredOn: string;

  quantity: string | null;

  unitPriceBrl: string | null;
  amountBrl: string;
  note?: string | null;
};

const AMOUNT_TOLERANCE = new Prisma.Decimal("0.01");
const MAX_NOTE_LENGTH = 200;

export async function addTransaction(input: { monthId: string; transaction: TransactionInput }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const position = await findPosition(transaction, month.id, input.transaction.positionId);



    if (input.transaction.kind === PositionTransactionKind.INCOME && automatic(position)) {
      throw new MonthEditError(`The return for ${position.asset.name} is calculated automatically.`);
    }

    const values = parseValues(position, month.referenceDate, input.transaction.kind, input.transaction);
    await transaction.positionTransaction.create({
      data: { userId: SCOPED_USER, positionId: position.id, ...values },
    });
    await recomputePosition(transaction, position.id, `The withdrawal exceeds the position for ${position.asset.name}.`);
  });
}


export async function updateTransaction(input: {
  monthId: string;
  transactionId: string;
  transaction: TransactionInput;
}) {
  return withUndo(input.monthId, async (transaction, month) => {
    const entry = await findMonthTransaction(transaction, month.id, input.transactionId);

    if (entry.transferId) {
      throw new MonthEditError("A liquidation cannot be partially corrected: delete it and liquidate again.");
    }

    if (entry.positionId !== input.transaction.positionId) {
      throw new MonthEditError("The transaction does not belong to this position.");
    }

    const position = await findPosition(transaction, month.id, entry.positionId);

    const kind = entry.kind === PositionTransactionKind.OPENING ? PositionTransactionKind.OPENING : input.transaction.kind;

    if (kind === PositionTransactionKind.INCOME && entry.kind !== PositionTransactionKind.INCOME && automatic(position)) {
      throw new MonthEditError(`The return for ${position.asset.name} is calculated automatically.`);
    }

    const values = parseValues(position, month.referenceDate, kind, input.transaction);
    await transaction.positionTransaction.update({ where: { id: entry.id }, data: values });
    await recomputePosition(transaction, position.id, "The correction would make the position negative.");
  });
}


export async function removeTransaction(input: { monthId: string; transactionId: string }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const entry = await findMonthTransaction(transaction, month.id, input.transactionId);
    const legs = entry.transferId
      ? await transaction.positionTransaction.findMany({
          where: { transferId: entry.transferId, position: { portfolioMonthId: month.id } },
          select: { id: true, positionId: true },
        })
      : [{ id: entry.id, positionId: entry.positionId }];

    await transaction.positionTransaction.deleteMany({ where: { id: { in: legs.map((leg) => leg.id) } } });

    for (const positionId of new Set(legs.map((leg) => leg.positionId))) {
      await recomputePosition(transaction, positionId, "Deleting this transaction would make the position negative.");
    }
  });
}

export type LiquidationInput = {
  positionId: string;
  /** YYYY-MM-DD */
  occurredOn: string;

  amountBrl: string;
};


export async function liquidatePosition(input: { monthId: string; liquidation: LiquidationInput }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const { liquidation } = input;
    const position = await findPosition(transaction, month.id, liquidation.positionId);
    const occurredOn = parseOccurredOn(liquidation.occurredOn, month.referenceDate);


    if (!position.quantity.greaterThan(0)) {
      throw new MonthEditError(`${position.asset.name} is already liquidated.`);
    }


    const later = await transaction.position.findFirst({
      where: {
        accountId: position.accountId,
        assetId: position.assetId,
        portfolioMonth: { referenceDate: { gt: month.referenceDate } },
      },
      select: { id: true },
    });

    if (later) {
      throw new MonthEditError(`${position.asset.name} continues in later months. Liquidate it in the last month in which it appears.`);
    }

    const received = parseAmount(liquidation.amountBrl);
    const note = "Liquidation";
    const quoted = Boolean(position.asset.quoteSymbol);
    let balance = position.totalBrl;


    if (automatic(position)) {
      await valueCdiPositions(transaction, { where: { id: position.id }, asOf: toDateKey(occurredOn) });
      await foldCalculatedIncome(transaction, month, position.id, occurredOn);
      balance = (await transaction.position.findUniqueOrThrow({ where: { id: position.id }, select: { totalBrl: true } })).totalBrl;
    }

    if (!quoted) {
      const difference = received.minus(balance);

      if (!difference.isZero()) {
        await transaction.positionTransaction.create({
          data: {
            userId: SCOPED_USER,
            positionId: position.id,
            kind: PositionTransactionKind.INCOME,
            occurredOn,
            quantity: difference.abs(),
            unitPriceBrl: null,
            amountBrl: difference,
            note: difference.isNegative() ? `${note}: received less than the balance` : note,
          },
        });
      }
    }


    const rest = await quantityOf(transaction, position.id);
    await transaction.positionTransaction.create({
      data: {
        userId: SCOPED_USER,
        positionId: position.id,
        kind: PositionTransactionKind.WITHDRAWAL,
        occurredOn,
        quantity: rest,
        unitPriceBrl: quoted ? received.div(rest).toDecimalPlaces(8) : null,
        amountBrl: received,
        note,
      },
    });
    await recomputePosition(transaction, position.id, `${position.asset.name} could not be reduced to zero.`);
  });
}


function automatic(position: { calculationStartDate: Date | null; asset: { autoIncome: boolean; quoteSymbol: string | null } }) {
  return Boolean(position.calculationStartDate && position.asset.autoIncome && !position.asset.quoteSymbol);
}

async function findPosition(transaction: Transaction, monthId: string, positionId: string) {
  const position = await transaction.position.findFirst({
    where: { id: positionId, portfolioMonthId: monthId },
    select: {
      id: true,
      accountId: true,
      assetId: true,
      quantity: true,
      unitPriceBrl: true,
      totalBrl: true,
      calculationStartDate: true,
      asset: { select: { quoteSymbol: true, name: true, autoIncome: true, assetType: true } },
    },
  });

  if (!position) {
    throw new MonthEditError("The position does not belong to this reporting month.");
  }

  if (position.asset.assetType === "international-bond") throw new MonthEditError("Use the bond valuation and coupon form to change this holding.");
  return position;
}

async function findMonthTransaction(transaction: Transaction, monthId: string, transactionId: string) {
  const entry = await transaction.positionTransaction.findFirst({
    where: { id: transactionId, position: { portfolioMonthId: monthId } },
    select: { id: true, kind: true, positionId: true, transferId: true, position: { select: { asset: { select: { assetType: true } } } } },
  });

  if (!entry) {
    throw new MonthEditError("The transaction does not belong to the selected reporting month or has already been deleted.");
  }

  if (entry.position.asset.assetType === "international-bond") throw new MonthEditError("Use the bond valuation and cash receipt form for this holding.");
  return entry;
}


function quantityEffect(entry: { kind: PositionTransactionKind; quantity: Prisma.Decimal; amountBrl: Prisma.Decimal }) {
  return entry.kind === PositionTransactionKind.WITHDRAWAL || entry.amountBrl.isNegative()
    ? entry.quantity.neg()
    : entry.quantity;
}


async function quantityOf(transaction: Transaction, positionId: string) {
  const position = await transaction.position.findUniqueOrThrow({
    where: { id: positionId },
    select: {
      openingQuantity: true,
      calculatedIncomeBrl: true,
      asset: { select: { quoteSymbol: true } },
      transactions: { select: { kind: true, quantity: true, amountBrl: true } },
    },
  });

  const plain = position.transactions.reduce((total, entry) => total.plus(quantityEffect(entry)), position.openingQuantity);


  return position.asset.quoteSymbol ? plain : plain.plus(position.calculatedIncomeBrl).toDecimalPlaces(2);
}


export async function recomputePosition(transaction: Transaction, positionId: string, negativeMessage: string) {
  const [plain, position] = await Promise.all([
    quantityOf(transaction, positionId),
    transaction.position.findUniqueOrThrow({
      where: { id: positionId },
      select: {
        unitPriceBrl: true,
        calculationStartDate: true,
        asset: { select: { quoteSymbol: true, autoIncome: true } },
      },
    }),
  ]);

  if (plain.lessThan(0)) {
    throw new MonthEditError(negativeMessage);
  }


  const cdi = automatic(position);
  const quantity = plain;

  let totalBrl: Prisma.Decimal;

  if (position.asset.quoteSymbol) {
    if (!position.unitPriceBrl) {
      throw new MonthEditError("A quoted position has no price and cannot be recalculated.");
    }
    totalBrl = quantity.mul(position.unitPriceBrl).toDecimalPlaces(2);
  } else {
    totalBrl = quantity.toDecimalPlaces(2);
  }

  await transaction.position.update({ where: { id: positionId }, data: { quantity, totalBrl } });

  if (cdi) {
    const [result] = await valueCdiPositions(transaction, { where: { id: positionId } });


    if (result?.state === "unavailable" && result.message === WITHDRAWAL_ABOVE_BALANCE) {
      throw new MonthEditError(negativeMessage);
    }
  }

  return { quantity, totalBrl };
}

type PositionForValues = Awaited<ReturnType<typeof findPosition>>;


function parseValues(
  position: PositionForValues,
  referenceDate: Date,
  kind: PositionTransactionKind | TransactionKind,
  input: TransactionInput,
) {
  const occurredOn = parseOccurredOn(input.occurredOn, referenceDate);
  const amount = parseAmount(input.amountBrl);
  let quantity: Prisma.Decimal;
  let unitPriceBrl: Prisma.Decimal | null = null;

  if (!position.asset.quoteSymbol) {
    quantity = amount;
  } else {
    quantity = input.quantity ? parseNonNegativeDecimal(input.quantity, 12, "the quantity") : new Prisma.Decimal(0);

    if (quantity.isZero() && kind !== PositionTransactionKind.INCOME) {
      throw new MonthEditError("Enter the transaction quantity.");
    }

    if (!quantity.isZero() && kind !== PositionTransactionKind.OPENING) {
      unitPriceBrl = input.unitPriceBrl
        ? parseNonNegativeDecimal(input.unitPriceBrl, 8, "the execution price")
        : amount.div(quantity).toDecimalPlaces(8);

      if (quantity.mul(unitPriceBrl).minus(amount).abs().greaterThan(AMOUNT_TOLERANCE.plus(amount.mul("0.000001")))) {
        throw new MonthEditError("Quantity, execution price and amount do not match. Review the fields.");
      }
    }
  }

  return {
    kind: kind as PositionTransactionKind,
    occurredOn,
    quantity,
    unitPriceBrl,
    amountBrl: amount,
    note: input.note?.trim().slice(0, MAX_NOTE_LENGTH) || null,
  };
}

function parseOccurredOn(raw: string, referenceDate: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new MonthEditError("Enter the transaction date.");
  }

  const day = new Date(`${raw}T00:00:00.000Z`);
  const today = calendarDay(new Date());

  if (Number.isNaN(day.getTime()) || toDateKey(day) !== raw) {
    throw new MonthEditError("Enter a valid transaction date.");
  }

  if (day < referenceDate || day > lastDayOf(referenceDate)) {
    throw new MonthEditError("The transaction date must fall within the selected reporting month.");
  }

  if (day > today) {
    throw new MonthEditError("The transaction date cannot be in the future.");
  }

  return day;
}

function parseAmount(raw: string) {
  const value = parseDecimal(raw.trim());

  if (!value || !value.greaterThan(0) || value.decimalPlaces() > 2) {
    throw new MonthEditError("Enter a BRL amount greater than zero with at most two decimal places.");
  }

  return value;
}

function parseNonNegativeDecimal(raw: string, maxDecimals: number, field: string) {
  const value = parseDecimal(raw.trim());

  if (!value || value.lessThan(0) || value.decimalPlaces() > maxDecimals) {
    throw new MonthEditError(`Review ${field}.`);
  }

  return value;
}
