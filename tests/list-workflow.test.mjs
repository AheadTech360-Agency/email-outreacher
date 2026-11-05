import { test } from "node:test"
import assert from "node:assert/strict"
import { parseViews, viewStorageKey, addSelection } from "../lib/list-workflow.ts"
import { reviewOrderAfterChange, reviewShortcut } from "../lib/review-shortcuts.ts"

test("saved views isolate accounts, workspaces and pages", () => {
  const a = viewStorageKey("u1", "w1", "people")
  assert.notEqual(a, viewStorageKey("u2", "w1", "people"))
  assert.notEqual(a, viewStorageKey("u1", "w2", "people"))
  assert.notEqual(a, viewStorageKey("u1", "w1", "companies"))
})
test("saved views tolerate invalid data and validate all values", () => {
  assert.deepEqual(parseViews("not json"), [])
  assert.deepEqual(parseViews("null"), [])
  assert.deepEqual(parseViews(JSON.stringify([{id: "a", name: "Bad", filters: {search: 5}}])), [])
  const valid = { id: "a", name: "No email", filters: { emailFilter: "none" } }
  assert.deepEqual(parseViews(JSON.stringify([valid])), [valid])
  assert.equal(parseViews(JSON.stringify(Array(30).fill(valid))).length, 20)
})
test("bulk selection preserves hidden selections and never mutates current set", () => {
  const current = new Set(["hidden", "one"])
  assert.deepEqual([...addSelection(current, ["one", "two", "three"])], ["hidden", "one", "two", "three"])
  assert.deepEqual([...current], ["hidden", "one"])
})
test("review shortcuts protect ordinary typing and use explicit modifier to approve", () => {
  assert.equal(reviewShortcut("j", false, true), null)
  assert.equal(reviewShortcut("k", false, true), null)
  assert.equal(reviewShortcut("j", false, false), "next")
  assert.equal(reviewShortcut("K", false, false), "previous")
  assert.equal(reviewShortcut("Enter", true, true), "approve")
  assert.equal(reviewShortcut("Enter", false, true), null)
  assert.equal(reviewShortcut("j", true, false), null)
})

test("approving next preserves review order; rewriting replaces only the current id", () => {
  const order = ["a", "b", "c"]
  assert.deepEqual(reviewOrderAfterChange(order, "a", "b"), ["a", "b", "c"])
  assert.deepEqual(reviewOrderAfterChange(order, "b", "rewritten"), ["a", "rewritten", "c"])
  assert.deepEqual(order, ["a", "b", "c"])
})
