"use client";

import { useEffect, useState } from "react";

import { Picker } from "@/components/ui/picker";
import { treasuryIndexerLabel } from "@/modules/portfolio/domain/treasury-purchase";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";
import type { TreasuryCatalogBond } from "@/modules/quotes/domain/treasury";


// Cache the catalog request; retry clears a failed request.
let catalogRequest: Promise<TreasuryCatalogBond[]> | null = null;
let requestedAt = 0;

const CATALOG_TTL_MS = 5 * 60 * 1000;

export function prefetchTreasuryCatalog() {
  if (catalogRequest && Date.now() - requestedAt > CATALOG_TTL_MS) {
    catalogRequest = null;
  }

  requestedAt = catalogRequest ? requestedAt : Date.now();
  catalogRequest ??= fetch("/api/quotes/treasury-catalog")
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.bonds)) throw new Error("Catalog unavailable");
      return data.bonds as TreasuryCatalogBond[];
    })
    .catch((error) => {
      catalogRequest = null;
      throw error;
    });
  return catalogRequest;
}


export function TreasuryPicker({ value, onSelect, invalid = false }: { invalid?: boolean; value: string | null; onSelect: (bond: TreasuryCatalogBond) => void }) {
  const [bonds, setBonds] = useState<TreasuryCatalogBond[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    prefetchTreasuryCatalog().then(
      (loaded) => {
        if (active) { setBonds(loaded); setError(null); }
      },
      () => {
        if (active) setError("Could not load Tesouro Direto securities right now.");
      },
    );
    return () => { active = false; };
  }, [attempt]);

  return <div className="space-y-2">
    <Picker
      invalid={invalid}
      aria-label="Tesouro Direto security"
      searchable={false}
      readOnly
      disabled={!bonds || bonds.length === 0}
      placeholder={bonds ? "Choose a type and maturity" : "Loading securities…"}
      emptyMessage={bonds ? "No security with this name" : "Loading Tesouro Direto securities…"}
      value={value}
      options={(bonds ?? []).map((bond) => ({ value: bond.symbol, label: bond.name, hint: bond.offered === false ? "Existing Holdings Only" : bond.purchaseRate !== undefined ? `${treasuryIndexerLabel(bond.indexer)} ${bond.purchaseRate.toFixed(2)}%` : formatBrl(bond.valueBrl) }))}
      onValueChange={(symbol) => { const bond = bonds?.find((entry) => entry.symbol === symbol); if (bond) onSelect(bond); }}
    />
    {bonds?.length === 0 ? <p className="text-xs text-muted-foreground">No securities with an official price available.</p> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error} <button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }} className="underline">Try again</button></p> : null}
  </div>;
}
