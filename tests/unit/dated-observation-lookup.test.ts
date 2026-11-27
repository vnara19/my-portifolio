import test from "node:test";
import assert from "node:assert/strict";
import { datedObservationLookup } from "../../src/modules/portfolio/domain/dated-observation-lookup";
test("indexed history matches reverse scans through exact, missing, future and stale dates", () => {
 const points = Array.from({ length: 1500 }, (_, index) => ({ day: new Date(Date.UTC(2020,0,1) + index * 2 * 86400000).toISOString().slice(0,10), rate: index + 1 }));
 const lookup = datedObservationLookup(points);
 for (let index = -2; index < 3020; index++) {
  const day = new Date(Date.UTC(2020,0,1) + index * 86400000).toISOString().slice(0,10);
  const expected = [...points].reverse().find(point => point.day <= day && Date.parse(day)-Date.parse(point.day) <= 7*86400000) ?? null;
  assert.deepEqual(lookup(day), expected);
 }
 assert.equal(lookup("invalid"), null);
 assert.equal(datedObservationLookup([])("2026-11-27"), null);
});
test("same-day records preserve the last observation and input is not mutated", () => {
 const points = [{day:"2026-11-20",rate:1},{day:"2026-11-19",rate:3},{day:"2026-11-20",rate:2}];
 const copy = structuredClone(points),lookup = datedObservationLookup(points);
 assert.equal(lookup("2026-11-27")?.rate, 2);
 assert.equal(lookup("2026-11-28"), null);
 assert.deepEqual(points, copy);
});
