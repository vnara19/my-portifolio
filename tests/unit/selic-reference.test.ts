import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma, type PrismaClient, type ReferenceRate, type ReferenceRatePoint } from "@/generated/prisma/client";
import { POST as devSync } from "@/app/api/quotes/dev-sync/route";
import { syncSelicReference } from "@/modules/quotes/application/selic-reference";
import { isQuoteSyncFailure } from "@/modules/quotes/application/quote-sync-report";
import { fetchSelicTarget, latestSelicObservation, parseSelicSoap, selicChangePoints } from "@/modules/quotes/infrastructure/bcb-selic";

const today = "2026-10-04";
const now = new Date(`${today}T15:00:00.000Z`);
const observation = { observedOn: today, percentAnnual: "14.00", source: "bcb-sgs-432" };
const history = { source: "bcb-sgs-432", observations: [{ observedOn: today, percentAnnual: "14.00" }] };

test("annual reference rates require valid nonfuture dates and retain valid zero values", () => {
  assert.deepEqual(latestSelicObservation([
    { data: "03/10/2026", valor: "13,75" },
    { data: "04/10/2026", valor: "14.00" },
    { data: "05/10/2026", valor: "99.00" },
    { data: "31/09/2026", valor: "20.00" },
    { data: "04/10/2026", valor: "-1" },
  ], today, observation.source), observation);
  assert.equal(latestSelicObservation([{ data: "04/10/2026", valor: "0" }], today, "test").percentAnnual, "0");
  assert.throws(() => latestSelicObservation([{ data: "05/10/2026", valor: "14" }], today, "test"), /valid/);
});

test("SOAP fallback reads only SGS432 and rejects another indexer", () => {
  const xml = "<root><SERIE ID='12'><ITEM><DATA>4/10/2026</DATA><VALOR>1</VALOR></ITEM></SERIE><SERIE ID='432'><ITEM><DATA>3/10/2026</DATA><VALOR>14</VALOR></ITEM><ITEM><DATA>4/10/2026</DATA><VALOR>15</VALOR><BLOQUEADO>true</BLOQUEADO></ITEM></SERIE></root>";
  const result = parseSelicSoap(xml.replaceAll("<", "&lt;").replaceAll(">", "&gt;"), today);
  assert.deepEqual(result.observations, [{ observedOn: "2026-10-03", percentAnnual: "14" }]);
  assert.equal(result.source, "bcb-sgs-432-soap");
  assert.throws(() => parseSelicSoap(xml.replace("ID='432'", "ID='11'"), today), /without the Selic target series/);
});

test("JSON is primary; fallback remains official and the date window ends today", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: string }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: String(init?.body ?? "") });
    if (String(url).startsWith("https://api.bcb.gov.br/")) throw new TypeError("network unavailable");
    return new Response("<SERIE ID='432'><ITEM><DATA>4/10/2026</DATA><VALOR>14</VALOR></ITEM></SERIE>");
  };
  try {
    const result = await fetchSelicTarget("2016-10-05", today);
    assert.equal(result.observations.at(-1)?.percentAnnual, "14");
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /bcdata.sgs.432\/dados/);
    assert.equal(new URL(requests[0].url).searchParams.get("dataInicial"), "05/10/2016");
    assert.equal(new URL(requests[0].url).searchParams.get("dataFinal"), "04/10/2026");
    assert.match(requests[1].body, /<dataInicio>05\/10\/2016<\/dataInicio>/);
    assert.equal(requests[1].url, "https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS");
    assert.match(requests[1].body, /<item>432<\/item>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reference history stores rate changes without duplicating an unchanged point", () => {
  const daily = {
    source: "test",
    observations: [
      { observedOn: "2026-09-15", percentAnnual: "15.00" },
      { observedOn: "2026-09-16", percentAnnual: "15" },
      { observedOn: "2026-09-17", percentAnnual: "14.25" },
      { observedOn: "2026-09-18", percentAnnual: "14.25" },
      { observedOn: "2026-10-02", percentAnnual: "13.75" },
    ],
  };
  assert.deepEqual(selicChangePoints(daily, null).map((point) => point.effectiveOn), ["2026-09-15", "2026-09-17", "2026-10-02"]);
  assert.deepEqual(selicChangePoints(daily, "15").map((point) => point.effectiveOn), ["2026-09-17", "2026-10-02"]);
});

function rateFixture(initial: ReferenceRate | null = null, initialPoints: ReferenceRatePoint[] = []) {
  let row = initial;
  const points = [...initialPoints];
  let serial = Promise.resolve();
  const referenceRate = {
    findUnique: async () => row,
    upsert: async ({ create, update }: { create: Partial<ReferenceRate>; update: Partial<ReferenceRate> }) => {
      row = row ? { ...row, ...update } : { key: "SELIC_TARGET", percentAnnual: null, observedOn: null, source: null, fetchedAt: null, lastAttemptAt: null, errorMessage: null, ...create };
      return row;
    },
    update: async ({ data }: { data: Partial<ReferenceRate> }) => { row = { ...row!, ...data }; return row; },
  };
  const referenceRatePoint = {
    findFirst: async ({ where }: { where: { effectiveOn?: { lt: Date } } }) =>
      points
        .filter((point) => !where.effectiveOn || point.effectiveOn < where.effectiveOn.lt)
        .sort((left, right) => right.effectiveOn.getTime() - left.effectiveOn.getTime())[0] ?? null,
    createMany: async ({ data }: { data: ReferenceRatePoint[] }) => {
      for (const point of data) {
        if (!points.some((entry) => entry.effectiveOn.getTime() === point.effectiveOn.getTime())) points.push(point);
      }
      return { count: data.length };
    },
  };
  const client = { referenceRate, referenceRatePoint, $executeRaw: async () => 0 };
  const prisma = {
    ...client,
    $transaction: (work: ((transaction: typeof client) => Promise<unknown>) | Promise<unknown>[]) => {
      if (Array.isArray(work)) return Promise.all(work);
      const result = serial.then(() => work(client));
      serial = result.then(() => undefined);
      return result;
    },
  } as unknown as PrismaClient;
  return { prisma, row: () => row, points: () => points };
}

const point = (day: string, percent: string): ReferenceRatePoint => ({ key: "SELIC_TARGET", effectiveOn: new Date(`${day}T00:00:00.000Z`), percentAnnual: new Prisma.Decimal(percent) });

test("concurrent and repeated checks within 24 hours call the source once", async () => {
  const fixture = rateFixture();
  let calls = 0;
  const starts: string[] = [];
  const fetchRate = async (start: string) => { calls++; starts.push(start); return history; };
  const [one, two] = await Promise.all([
    syncSelicReference(fixture.prisma, { now, fetchRate }),
    syncSelicReference(fixture.prisma, { now, fetchRate }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual([one.state, two.state].sort(), ["fetched", "fresh"]);
  const repeat = await syncSelicReference(fixture.prisma, { now: new Date(now.getTime() + 23 * 60 * 60 * 1000), fetchRate });
  assert.equal(repeat.state, "fresh");
  assert.equal(calls, 1);
  const next = await syncSelicReference(fixture.prisma, { now: new Date(now.getTime() + 24 * 60 * 60 * 1000), fetchRate });
  assert.equal(next.state, "fetched");
  assert.equal(calls, 2);

  assert.deepEqual(starts, ["2016-10-05", today]);
  assert.deepEqual(fixture.points().map((entry) => entry.percentAnnual.toString()), ["14"]);
});

test("missing history backfills points without waiting another 24 hours", async () => {
  const fixture = rateFixture({ key: "SELIC_TARGET", percentAnnual: new Prisma.Decimal(13.75), observedOn: new Date(today), fetchedAt: now, lastAttemptAt: now, source: "bcb-sgs-432", errorMessage: null });
  let calls = 0;
  const fetchRate = async () => { calls++; return history; };
  assert.equal((await syncSelicReference(fixture.prisma, { now, fetchRate })).state, "fetched");
  assert.equal((await syncSelicReference(fixture.prisma, { now, fetchRate })).state, "fresh");
  assert.equal(calls, 1);
  assert.equal(fixture.points().length, 1);
});

test("failures retain the previous annual rate and date without repeated requests", async () => {
  const fixture = rateFixture({ key: "SELIC_TARGET", percentAnnual: new Prisma.Decimal(13.75), observedOn: new Date("2026-10-02"), fetchedAt: new Date("2026-10-02"), lastAttemptAt: new Date("2026-10-02"), source: "bcb-sgs-432", errorMessage: null }, [point("2026-09-17", "13.75")]);
  let calls = 0;
  const fetchRate = async () => { calls++; throw new TypeError("offline"); };
  const result = await syncSelicReference(fixture.prisma, { now, fetchRate });
  assert.equal(result.state, "failed");
  assert.equal(fixture.row()?.percentAnnual?.toString(), "13.75");
  assert.equal(fixture.row()?.observedOn?.toISOString().slice(0, 10), "2026-10-02");
  const repeat = await syncSelicReference(fixture.prisma, { now, fetchRate });
  assert.equal(repeat.state, "failed");
  assert.equal(calls, 1);
  assert.equal(isQuoteSyncFailure({ state: "idle", selic: result }), true);
});

test("production dev-sync rejects before sessions, database or providers", async () => {
  const original = process.env.NODE_ENV;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  Object.assign(process.env, { NODE_ENV: "production" });
  globalThis.fetch = async () => { calls++; throw new Error("production must not fetch"); };
  try {
    const response = await devSync(new Request("http://localhost:3000/api/quotes/dev-sync", { method: "POST" }));
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  } finally {
    Object.assign(process.env, { NODE_ENV: original });
    if (original === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    globalThis.fetch = originalFetch;
  }
});
