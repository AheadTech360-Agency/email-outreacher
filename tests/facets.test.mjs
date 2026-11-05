import { test } from "node:test"
import assert from "node:assert/strict"
import { presenceMatches, scoreMatches, textMatches, recentMatches, choices, pickFacets } from "../lib/facets.ts"

test("presence handles absent data, whitespace and zero counts", () => {
  for (const value of [undefined, null, "", "  ", 0, false]) {
    assert.equal(presenceMatches(value, "yes"), false)
    assert.equal(presenceMatches(value, "no"), true)
    assert.equal(presenceMatches(value), true)
  }
  for (const value of ["email@example.com", 2, true]) assert.equal(presenceMatches(value, "yes"), true)
})
test("score bands have non-overlapping boundaries and preserve unscored records", () => {
  assert.equal(scoreMatches(0, "low"), true)
  assert.equal(scoreMatches(60, "low"), false)
  assert.equal(scoreMatches(60, "medium"), true)
  assert.equal(scoreMatches(80, "medium"), false)
  assert.equal(scoreMatches(80, "high"), true)
  assert.equal(scoreMatches(null, "high"), false)
  assert.equal(scoreMatches(undefined, "unscored"), true)
  assert.equal(scoreMatches(0, "unscored"), false)
})
test("search matches every word across fields and tolerates missing fields", () => {
  assert.equal(textMatches("  TEXAS retail ", "Retail Ltd", null, "Texas"), true)
  assert.equal(textMatches("Texas software", "Retail", "Texas"), false)
  assert.equal(textMatches("", undefined), true)
})
test("recency includes cutoff and excludes future, invalid and missing dates", () => {
  const now = Date.parse("2026-11-05T12:00:00Z")
  assert.equal(recentMatches("2026-10-29T12:00:00Z", "7", now), true)
  assert.equal(recentMatches("2026-10-29T11:59:59Z", "7", now), false)
  for (const value of [null, "bad", "2026-11-06T00:00:00Z"]) assert.equal(recentMatches(value, "7", now), false)
  assert.equal(recentMatches(null, "all", now), true)
})
test("facet options are unique and saved views restore only allowed keys", () => {
  assert.deepEqual(choices(["B", null, "A", "B", "", "  "]), [{value:"A",label:"A"},{value:"B",label:"B"}])
  assert.deepEqual(pickFacets({query:"search",source:"Apollo",status:"all"}, ["source","missing"]), {source:"Apollo"})
})
