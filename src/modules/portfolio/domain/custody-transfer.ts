import { Prisma } from "@/generated/prisma/client";

type CustodyLeg = {
  kind: string;
  assetId?: string;
  account: string;
  day?: string;
  quantity: Prisma.Decimal | string | number;
};

export function custodyTransferPair<T extends CustodyLeg>(legs: T[]) {
  if (legs.length !== 2) return null;
  const debit = legs.find(leg => leg.kind === "WITHDRAWAL");
  const credit = legs.find(leg => leg.kind === "CONTRIBUTION");
  if (!debit || !credit || !debit.assetId || debit.assetId !== credit.assetId ||
    !debit.day || debit.day !== credit.day || debit.account === credit.account) return null;
  const units = new Prisma.Decimal(debit.quantity);
  return units.gt(0) && units.eq(credit.quantity) ? { debit, credit, units } : null;
}
