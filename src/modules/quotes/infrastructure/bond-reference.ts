import { z } from "zod";
import { fetchJson } from "./http";
import { bondLookupFieldsSchema, type BondLookupSource } from "@/modules/portfolio/domain/bond-lookup";
import { validBondIdentifier, scheduledBondCoupons } from "@/modules/portfolio/domain/international-bond";

/** OpenFIGI returns identification, not a coupon calendar. Do not parse terms from ticker text. */
export async function openFigiBond(identifier: string): Promise<BondLookupSource | null> {
  const payload = await fetchJson(new URL("https://api.openfigi.com/v3/mapping"), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify([{ idType: identifier.length === 12 ? "ID_ISIN" : "ID_CUSIP", idValue: identifier }]),
  }, { timeoutMs: 6000 });
  const parsed = z.array(z.object({ data: z.array(z.object({ name: z.string(), marketSector: z.string(), securityType: z.string() })).optional() })).parse(payload);
  const rows = parsed[0]?.data?.filter((row) => ["Corp", "Govt", "Muni", "Mtge", "M-Mkt"].includes(row.marketSector)) ?? [];
  // An instrument's name is not necessarily its legal issuer. Show identification
  // separately instead of guessing the Issuer field or parsing ticker terms.
  const names = new Set(rows.map((r) => r.name.trim()));
  return names.size === 1 ? { name: "OpenFIGI", url: "https://www.openfigi.com/", fields: {}, instrumentName: [...names][0] } : null;
}

/** A US ISIN embeds its CUSIP. Only Treasury CUSIPs are sent to the Treasury dataset. */
export function treasuryCusip(identifier: string) {
  const cusip = identifier.startsWith("US") && identifier.length === 12 ? identifier.slice(2, 11) : identifier;
  return /^912[A-Z0-9]{6}$/.test(cusip) && validBondIdentifier(cusip) ? cusip : null;
}
export async function treasuryBond(identifier: string): Promise<BondLookupSource | null> {
  const cusip = treasuryCusip(identifier);
  if (!cusip) return null;
  const url = new URL("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query");
  url.searchParams.set("filter", `cusip:eq:${cusip}`);
  url.searchParams.set("sort", "-auction_date"); url.searchParams.set("page[size]", "1");
  url.searchParams.set("fields", "cusip,auction_date,security_type,maturity_date,int_rate,int_payment_frequency,first_int_payment_date,inflation_index_security,floating_rate,callable");
  const payload = await fetchJson(url, undefined, { timeoutMs: 6000 });
  const parsed = z.object({ data: z.array(z.record(z.string(), z.string().nullable())) }).parse(payload);
  const row = parsed.data[0];
  if (!row || row.cusip !== cusip) return null;
  const structure = row.inflation_index_security === "Yes" ? "Inflation" : row.floating_rate === "Yes" ? "Floating" : row.callable === "Yes" ? "Callable" : row.security_type === "Bill" ? "Zero" : ["Note", "Bond"].includes(row.security_type ?? "") ? "Fixed" : undefined;
  const fields = bondLookupFieldsSchema.parse({ issuer: "U.S. Treasury", issuerCountry: "United States", family: "Sovereign", currency: "USD", structure,
    ...(row.maturity_date && row.maturity_date !== "null" ? { maturityDate: row.maturity_date } : {}),
    ...(structure === "Fixed" && row.int_rate && Number(row.int_rate) > 0 ? { annualRate: String(Number(row.int_rate)) } : {}),
    ...(structure === "Fixed" && row.int_payment_frequency === "Semi-Annual" ? { frequency: "2" } : {}),
    // Coupon dates use the contractual maturity anchor, preserving end-of-month dates.
    ...(structure === "Fixed" && row.int_payment_frequency === "Semi-Annual" && row.maturity_date && row.maturity_date !== "null" ? { anchorDate: row.maturity_date } : {}),
  });
  if (fields.anchorDate && fields.annualRate && fields.frequency && fields.maturityDate) {
    const next = scheduledBondCoupons({ annualRate: fields.annualRate, frequency: 2, anchorDate: fields.anchorDate, dayCount: "Manual" }, new Date().toISOString().slice(0, 10), fields.maturityDate, "1")[0];
    fields.anchorDate = next?.date ?? fields.maturityDate;
  }
  // Treasury minimum purchases are not face value per bond: leave denomination manual.
  return { name: "U.S. Treasury", url: "https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/", fields };
}
