"use server";

/** Investment server actions validate inputs and scope every write to the authenticated user and open reporting month. */

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  addPosition,
  cloneLatestMonth,
  editPosition,
  MonthEditError,
  removePosition,
  setMonthOpen,
  undoChange,
  updateMonthQuotes,
} from "@/modules/portfolio/application/month-editing";
import { ensureMonthsUpToDate } from "@/modules/portfolio/application/month-rollover";
import {
  addTransaction,
  liquidatePosition,
  removeTransaction,
  updateTransaction,
} from "@/modules/portfolio/application/position-transactions";
import { requireSessionUser } from "@/modules/auth/session";
import { internationalBondSchema } from "@/modules/portfolio/domain/international-bond";
import { brazilianFixedIncomeSchema } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { ASSET_KINDS } from "@/modules/portfolio/domain/asset-kinds";
import { ASSET_TYPES } from "@/modules/portfolio/domain/classification";
import type { MonthRolloverOutcome } from "@/modules/portfolio/domain/month-rollover";
import { TRANSACTION_KINDS } from "@/modules/portfolio/domain/position-transactions";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";

export type EditActionResult =
  | { ok: true; message: string; undoToken?: string; month?: string }
  | { ok: false; message: string };

const value = z.string().trim().min(1).max(40);
const strategy = z.string().trim().max(60).nullable();
const monthScope = { monthId: z.string().uuid() };
const label = (max: number) => z.string().trim().min(1).max(max);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((entry) => entry >= "2000-01-01" && entry <= "2100-12-31" && !Number.isNaN(Date.parse(`${entry}T00:00:00Z`)));


const allocationsSchema = z
  .array(
    z.object({
      assetClass: z.string().max(80),
      subclass: z.string().max(80),
      duration: z.string().max(80),
      weightPercent: value,

      ratePercent: z.string().trim().max(12).nullable().optional(),
    }),
  )
  .min(1)
  .max(20);


const newAccountSchema = z
  .object({
    institutionId: z.string().uuid().nullable(),
    institutionName: label(60).nullable(),
    name: label(60),
  })
  .refine((account) => (account.institutionId === null) !== (account.institutionName === null));

const newAssetSchema = z.object({
  fixedIncomeContract: brazilianFixedIncomeSchema.optional(),
  bondContract: internationalBondSchema.optional(),
  name: label(80),
  kind: z.enum(ASSET_KINDS),
  ticker: z.string().trim().max(120).nullable(),
  maturityDate: day.nullable(),
  liquidity: z.string().trim().max(30).nullable().optional(),
  quoteCheckToken: z.string().min(1).max(4096).nullable(),
  manualPriceBrl: value.nullable(),
  cashAccount: z.boolean().optional(),
  autoIncome: z.boolean().optional(),
  appliedOn: day.nullable().optional(),
});

const addSchema = z.object({
  ...monthScope,
  addition: z
    .object({
      accountId: z.string().uuid().optional(),
      newAccount: newAccountSchema.optional(),
      assetId: z.string().uuid().optional(),
      newAsset: newAssetSchema.optional(),
      value,
      valueKind: z.enum(["quantity", "amount"]).optional(),
      initialKind: z.enum(["OPENING", "CONTRIBUTION"]).optional(),
      executedPriceBrl: value.nullable().optional(),
      purchase: z.object({ amountInvested: value.optional(), contractedRate: value.optional(), side: z.enum(["BUY", "SELL"]).optional(), price: value, commission: value, currency: z.enum(["USD", "EUR", "BRL"]), occurredOn: day }).optional(),
      strategy,
      allocations: z.union([z.tuple([]), allocationsSchema]),
    })
    .refine((addition) => !(addition.accountId && addition.newAccount))
    .refine((addition) => (addition.assetId === undefined) !== (addition.newAsset === undefined)),
});

const editSchema = z.object({
  ...monthScope,

  edit: z.object({
    positionId: z.string().uuid(),
    strategy,
    allocations: allocationsSchema,
    asset: z.object({
      name: label(120),
      liquidity: z.string().trim().max(60).nullable(),
      maturityDate: day.nullable(),
      cashAccount: z.boolean().optional(),
      autoIncome: z.boolean().optional(),
      assetType: z.enum(ASSET_TYPES).optional(),
    }),
  }),
});

const quotesSchema = z.object({
  ...monthScope,
  quotes: z.array(z.object({ symbol: z.string().trim().min(1).max(120), valueBrl: value })).min(1).max(100),
});

export async function addPositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = addSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the position fields and try again." };
  }

  return run(async () => {


    const result = await addPosition(parsed.data);
    return { ok: true, message: "Position added.", undoToken: result.undoToken };
  });
}

export async function editPositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = editSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the position fields and try again." };
  }

  return run(async () => {
    const result = await editPosition(parsed.data);
    return { ok: true, message: "Position saved.", undoToken: result.undoToken };
  });
}

export async function removePositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = z.object({ ...monthScope, positionId: z.string().uuid() }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Invalid position." };
  }

  return run(async () => {
    const result = await removePosition(parsed.data);
    return { ok: true, message: "Position removed.", undoToken: result.undoToken };
  });
}

export async function saveQuotesAction(input: unknown): Promise<EditActionResult> {
  const parsed = quotesSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the entered quotes." };
  }

  return run(async () => {
    const result = await updateMonthQuotes(parsed.data);
    return { ok: true, message: "Quotes saved and positions recalculated.", undoToken: result.undoToken };
  });
}

export async function setMonthOpenAction(input: unknown): Promise<EditActionResult> {
  const parsed = z.object({ monthId: z.string().uuid(), open: z.boolean() }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Invalid reporting month." };
  }

  return run(async () => {
    await setMonthOpen(parsed.data);
    return { ok: true, message: parsed.data.open ? "Month opened for editing." : "Month closed." };
  });
}

export async function cloneLatestMonthAction(): Promise<EditActionResult> {
  return run(async () => {
    const result = await cloneLatestMonth();
    return {
      ok: true,
      message: "Reporting month created from the previous month.",
      undoToken: result.undoToken,
      month: toMonthParam(result.referenceDate),
    };
  });
}

const transactionSchema = z.object({
  ...monthScope,
  transaction: z.object({
    positionId: z.string().uuid(),
    kind: z.enum(TRANSACTION_KINDS),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.string().trim().max(40).nullable(),
    unitPriceBrl: z.string().trim().max(40).nullable(),
    amountBrl: z.string().trim().min(1).max(40),
    note: z.string().trim().max(200).nullable().optional(),
  }),
});

const transactionRemovalSchema = z.object({ ...monthScope, transactionId: z.string().uuid() });
const transactionUpdateSchema = transactionSchema.extend({ transactionId: z.string().uuid() });

const TRANSACTION_DONE: Record<(typeof TRANSACTION_KINDS)[number], string> = {
  CONTRIBUTION: "Contribution recorded.",
  WITHDRAWAL: "Withdrawal recorded.",
  INCOME: "Return recorded.",
};


export async function addTransactionAction(input: unknown): Promise<EditActionResult> {
  const parsed = transactionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the transaction fields and try again." };
  }

  return run(async () => {
    const result = await addTransaction(parsed.data);
    return { ok: true, message: TRANSACTION_DONE[parsed.data.transaction.kind], undoToken: result.undoToken };
  });
}


export async function updateTransactionAction(input: unknown): Promise<EditActionResult> {
  const parsed = transactionUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the transaction fields and try again." };
  }

  return run(async () => {
    const result = await updateTransaction(parsed.data);
    return { ok: true, message: "Transaction corrected.", undoToken: result.undoToken };
  });
}


export async function removeTransactionAction(input: unknown): Promise<EditActionResult> {
  const parsed = transactionRemovalSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Could not identify the transaction." };
  }

  return run(async () => {
    const result = await removeTransaction(parsed.data);
    return { ok: true, message: "Transaction deleted.", undoToken: result.undoToken };
  });
}

const liquidationSchema = z.object({
  ...monthScope,
  liquidation: z.object({
    positionId: z.string().uuid(),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountBrl: z.string().trim().min(1).max(40),
  }),
});


export async function liquidatePositionAction(input: unknown): Promise<EditActionResult> {
  const parsed = liquidationSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Review the liquidation fields and try again." };
  }

  return run(async () => {
    const result = await liquidatePosition(parsed.data);
    return { ok: true, message: "Position liquidated.", undoToken: result.undoToken };
  });
}


export async function confirmMonthRolloverAction(): Promise<MonthRolloverOutcome> {
  await requireSessionUser();

  try {
    const outcome = await ensureMonthsUpToDate();
    revalidatePath("/");
    revalidatePath("/posicoes");
    return outcome;
  } catch (error) {
    unstable_rethrow(error);
    return { state: "unavailable", message: "Could not create the reporting month." };
  }
}


export async function startPortfolioAction(): Promise<EditActionResult> {
  return run(async () => {
    const outcome = await ensureMonthsUpToDate();

    if (outcome.state === "unavailable") {
      return { ok: false, message: outcome.message };
    }

    return { ok: true, message: "Reporting month created." };
  });
}

export async function undoChangeAction(token: unknown): Promise<EditActionResult> {
  const parsed = z.string().uuid().safeParse(token);

  if (!parsed.success) {
    return { ok: false, message: "This change can no longer be undone." };
  }

  return run(async () => {
    const result = await undoChange(parsed.data);
    return {
      ok: true,
      message: result.deleted ? "Reporting month removed." : "Change undone.",
      month: result.deleted ? undefined : toMonthParam(result.referenceDate),
    };
  });
}

async function run(operation: () => Promise<EditActionResult>): Promise<EditActionResult> {

  await requireSessionUser();

  try {
    const result = await operation();
    revalidatePath("/");
    revalidatePath("/posicoes");
    revalidatePath("/posicoes/cotacoes");
    revalidatePath("/posicoes/[accountId]/[assetId]", "page");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      message: error instanceof MonthEditError ? error.message : "Could not complete the operation.",
    };
  }
}
