
/** Redemption terms describe liquidity, independently of an asset's maturity date. Keep legacy keys for imported allocations. */
import { englishLabel } from "@/lib/english-labels";


export const NO_REDEMPTION = "-";

export const REDEMPTION_VALUES = ["Curto", "Médio", "Longo", NO_REDEMPTION] as const;

export function isRedemption(value: string) {
  return (REDEMPTION_VALUES as readonly string[]).includes(value);
}

export function redemptionLabel(value: string) {
  return value === NO_REDEMPTION ? "None" : englishLabel(value);
}
