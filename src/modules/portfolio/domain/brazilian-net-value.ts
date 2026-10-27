import { Prisma } from "@/generated/prisma/browser";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";

const IOF = [100,96,93,90,86,83,80,76,73,70,66,63,60,56,53,50,46,43,40,36,33,30,26,23,20,16,13,10,6,3];

/** Standard Brazilian individual CDB redemption taxes. All inputs represent one known deposit. */
export function brazilianNetValue(gross: PrismaTypes.Decimal, principal: PrismaTypes.Decimal, appliedOn: Date, asOf: Date, exempt = false) {
  const days = Math.max(0, Math.floor((asOf.getTime() - appliedOn.getTime()) / 86400000));
  const profit = Prisma.Decimal.max(0, gross.minus(principal));
  const iof = exempt || days >= 30 ? new Prisma.Decimal(0) : profit.mul(IOF[days]).div(100).toDecimalPlaces(2);
  const rate = exempt ? 0 : days <= 180 ? 22.5 : days <= 360 ? 20 : days <= 720 ? 17.5 : 15;
  const ir = profit.minus(iof).mul(rate).div(100).toDecimalPlaces(2);
  return { net: gross.minus(iof).minus(ir).toDecimalPlaces(2), ir, iof };
}
