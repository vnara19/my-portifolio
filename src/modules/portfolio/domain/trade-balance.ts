import { Prisma } from "@/generated/prisma/client";

type Movement = { date: Date; quantity: Prisma.Decimal; sale: boolean };

/** Replay execution dates, preserving order within each day, to reject sales before ownership. */
export function tradeBalance(opening: Prisma.Decimal, movements: Movement[]) {
  let balance = opening;
  for (const movement of [...movements].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    balance = movement.sale ? balance.minus(movement.quantity) : balance.plus(movement.quantity);
    if (balance.lt(0)) throw new Error("The sale quantity exceeds the units held on the transaction date.");
  }
  return balance;
}
