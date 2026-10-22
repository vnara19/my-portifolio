import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@/generated/prisma/client";
import { cleanName, normalizeKey, USD_SYMBOL } from "@/modules/portfolio/domain/asset-kinds";
import { MAX_LIQUIDITY_LENGTH, normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { assetTypeOf, isAssetType } from "@/modules/portfolio/domain/classification";
import { supportsAutoIncome } from "@/modules/portfolio/domain/fixed-income-policy";


//




const DAY_SUFFIX = /:\d{4}-\d{2}-\d{2}$/;
export const MAX_ASSET_NAME_LENGTH = 80;

export class AssetAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetAttributeError";
  }
}

export type AssetAttributes = {
  name: string;
  liquidity: string | null;
  /** YYYY-MM-DD */
  maturityDate: string | null;


  cashAccount?: boolean;


  autoIncome?: boolean;

  assetType?: string;
};


export type AssetState = {
  fixedIncomeContract?: Prisma.InputJsonValue;
  expectedFixedIncomeContract?: Prisma.InputJsonValue;
  id: string;
  name: string;
  normalizedKey: string;
  liquidity: string | null;
  maturityDate: Date | null;
  cashAccount: boolean;
  autoIncome: boolean;
  assetType: string | null;
};


export async function applyAssetAttributes(
  transaction: Prisma.TransactionClient,
  assetId: string,
  next: AssetAttributes,
): Promise<AssetState | null> {
  const asset = await transaction.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      name: true,
      normalizedKey: true,
      liquidity: true,
      maturityDate: true,
      quoteSymbol: true,
      cashAccount: true,
      autoIncome: true,
      assetType: true,
      baseCurrency: true,
    },
  });

  if (!asset) {
    throw new AssetAttributeError("Asset not found.");
  }

  if (asset.assetType === "international-bond") throw new AssetAttributeError("Manage this bond from its valuation panel.");
  const name = cleanName(next.name);
  const normalizedName = normalizeKey(name);

  if (!normalizedName || name.length > MAX_ASSET_NAME_LENGTH) {
    throw new AssetAttributeError(`Enter a name with up to ${MAX_ASSET_NAME_LENGTH} characters.`);
  }

  const liquidity = normalizeLiquidity(next.liquidity);

  if (liquidity && liquidity.length > MAX_LIQUIDITY_LENGTH) {
    throw new AssetAttributeError(`Liquidity accepts up to ${MAX_LIQUIDITY_LENGTH} characters.`);
  }

  const maturity = next.maturityDate;


  const treasuryMaturity = asset.quoteSymbol?.startsWith("TD:") ? asset.quoteSymbol.slice(-10) : null;
  if (treasuryMaturity && maturity !== treasuryMaturity) {
    throw new AssetAttributeError("The selected Tesouro Direto security determines its maturity.");
  }
  if (maturity && asset.quoteSymbol && asset.quoteSymbol !== USD_SYMBOL && !treasuryMaturity) {
    throw new AssetAttributeError("Quoted assets do not have a maturity date.");
  }

  if (maturity && !isValidDay(maturity)) {
    throw new AssetAttributeError("Enter a valid maturity date.");
  }

  const currentMaturity = asset.maturityDate ? asset.maturityDate.toISOString().slice(0, 10) : null;
  const cashAccount = next.cashAccount ?? asset.cashAccount;

  if (cashAccount && asset.quoteSymbol && asset.quoteSymbol !== USD_SYMBOL) {
    throw new AssetAttributeError("Only BRL or USD cash can be a current account.");
  }


  const autoIncome = next.autoIncome ?? asset.autoIncome;
  const typeForIncome = next.assetType ?? assetTypeOf({ ...asset, name: asset.name });

  if (autoIncome && (asset.quoteSymbol || !supportsAutoIncome(typeForIncome))) {
    throw new AssetAttributeError("Only fixed income and BRL cash without market quotes support automatic accrual.");
  }

  if (next.assetType !== undefined && !isAssetType(next.assetType)) {
    throw new AssetAttributeError("Choose an asset type from the list.");
  }

  const assetType = next.assetType ?? asset.assetType;

  if (
    asset.name === name &&
    asset.liquidity === liquidity &&
    currentMaturity === maturity &&
    asset.cashAccount === cashAccount &&
    asset.autoIncome === autoIncome &&
    asset.assetType === assetType
  ) {
    return null;
  }

  const parts = asset.normalizedKey.replace(DAY_SUFFIX, "").split(":");
  const nameIndex = parts[0] === "private" ? 2 : 1;

  if (parts.length <= nameIndex) {
    throw new AssetAttributeError("Could not identify this asset's key.");
  }

  parts[nameIndex] = normalizedName;
  const normalizedKey = `${parts.join(":")}${maturity ? `:${maturity}` : ""}`;

  if (normalizedKey !== asset.normalizedKey) {
    const twin = await transaction.asset.findFirst({ where: { normalizedKey }, select: { id: true } });

    if (twin && twin.id !== asset.id) {
      throw new AssetAttributeError(
        maturity ? "An asset with this name and maturity already exists." : "An asset with this name already exists.",
      );
    }
  }

  await transaction.asset.update({
    where: { id: asset.id },
    data: {
      name,
      normalizedKey,
      liquidity,
      maturityDate: maturity ? new Date(`${maturity}T00:00:00.000Z`) : null,
      cashAccount,
      autoIncome,
      assetType,
    },
  });

  return {
    id: asset.id,
    name: asset.name,
    normalizedKey: asset.normalizedKey,
    liquidity: asset.liquidity,
    maturityDate: asset.maturityDate,
    cashAccount: asset.cashAccount,
    autoIncome: asset.autoIncome,
    assetType: asset.assetType,
  };
}


export async function restoreAssetState(transaction: Prisma.TransactionClient, state: AssetState) {
  if (state.expectedFixedIncomeContract) {
    const current = await transaction.asset.findUnique({ where: { id: state.id }, select: { fixedIncomeContract: true } });
    if (!isDeepStrictEqual(current?.fixedIncomeContract, state.expectedFixedIncomeContract)) throw new AssetAttributeError("This bond has changed since the update; it cannot be undone safely.");
  }
  const twin = await transaction.asset.findFirst({ where: { normalizedKey: state.normalizedKey }, select: { id: true } });

  if (twin && twin.id !== state.id) {
    throw new AssetAttributeError("Another asset now uses the previous name; this change cannot be undone.");
  }

  await transaction.asset.updateMany({
    where: { id: state.id },
    data: {
      name: state.name,
      normalizedKey: state.normalizedKey,
      liquidity: state.liquidity,
      maturityDate: state.maturityDate,
      cashAccount: state.cashAccount,
      autoIncome: state.autoIncome,
      assetType: state.assetType,
      ...(state.fixedIncomeContract ? { fixedIncomeContract: state.fixedIncomeContract } : {}),
    },
  });
}

function isValidDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    day >= "2000-01-01" &&
    day <= "2100-12-31" &&
    !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
  );
}


export function parseCdiPercent(raw: string | null) {
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const normalized = raw.trim().replace(/\s/g, "").replace("%", "");
  const text = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new AssetAttributeError("Enter the CDI percentage, such as 105 for 105% of CDI.");
  }

  const value = new Prisma.Decimal(text);

  if (!value.greaterThan(0) || value.greaterThan(1000) || value.decimalPlaces() > 3) {
    throw new AssetAttributeError("Use a CDI percentage greater than zero and up to 1,000%, with at most three decimal places.");
  }

  return value;
}


export function parseFixedRate(raw: string | null) {
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const normalized = raw.trim().replace(/\s/g, "").replace("%", "");
  const text = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new AssetAttributeError("Enter the annual rate, such as 12.5 for 12.5% p.a.");
  }

  const value = new Prisma.Decimal(text);

  if (!value.greaterThan(0) || value.greaterThan(100) || value.decimalPlaces() > 4) {
    throw new AssetAttributeError("Use an annual rate greater than zero and up to 100%, with at most four decimal places.");
  }

  return value;
}
