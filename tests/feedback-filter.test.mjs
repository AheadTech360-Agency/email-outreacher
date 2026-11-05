import { test } from "node:test"
import assert from "node:assert/strict"
import { filterFeedback } from "../lib/feedback-filter.ts"

const names = new Map([["icp1", "Print shops"]])
const base = { query: "", hook: "all", tag: "all", score: "all", sort: "newest" }
const email = (id, extra = {}) => ({ id, subject: "Store launch", body: "New collection", hook: "", score: 70,
  createdAt: `2026-11-0${id}`, feedback: null, lead: { firstName: "Ana", lastName: "Ruiz", title: "Owner", company: "Ink Co", email: "ana@ink.example", icpId: "icp1" }, ...extra })
const rows = [email("1", { score: null }), email("2", { score: 40, hook: "New store", feedback: { rating: "bad", tags: ["too_generic"], note: "Needs specifics", updatedAt: "2026-11-05" } }),
  email("3", { score: 90, feedback: { rating: "good", tags: ["clear_cta"], note: "Useful", updatedAt: "2026-11-04" } })]
const find = (filters) => filterFeedback(rows, { ...base, ...filters }, names).map((r) => r.id)

test("search matches person, company, address, subject, body and ICP across multiple terms", () => {
  assert.deepEqual(find({ query: "ANA ink print collection" }), ["3", "2", "1"])
  assert.deepEqual(find({ query: "ana@ink.example launch" }), ["3", "2", "1"])
  assert.deepEqual(find({ query: "unmatched" }), [])
})
test("search includes feedback notes and readable tags", () => {
  assert.deepEqual(find({ query: "SPECIFICS" }), ["2"])
  assert.deepEqual(find({ query: "too generic" }), ["2"])
  assert.deepEqual(filterFeedback(rows, { ...base, query: "clear ask" }, names, { clear_cta: "Clear ask" }).map((r) => r.id), ["3"])
})
test("hook and tag filters combine with search", () => {
  assert.deepEqual(find({ hook: "with", tag: "too_generic", query: "Ana" }), ["2"])
  assert.deepEqual(find({ hook: "without", tag: "too_generic" }), [])
})
test("score bands distinguish unscored from zero and handle boundaries", () => {
  assert.deepEqual(find({ score: "low" }), ["2"])
  assert.deepEqual(find({ score: "high" }), ["3"])
  assert.deepEqual(find({ score: "unscored" }), ["1"])
  const scores = [0, 59, 60, 79, 80, 100].map((score, i) => email(String(i + 1), { score }))
  assert.deepEqual(filterFeedback(scores, { ...base, score: "medium" }, names).map((r) => r.score), [79, 60])
})
test("sorts scores both ways with unscored records last", () => {
  assert.deepEqual(find({ sort: "score-low" }), ["2", "3", "1"])
  assert.deepEqual(find({ sort: "score-high" }), ["3", "2", "1"])
})
test("supports oldest and most recently rated", () => {
  assert.deepEqual(find({ sort: "oldest" }), ["1", "2", "3"])
  assert.deepEqual(find({ sort: "rated" }), ["2", "3", "1"])
})
test("does not mutate input and handles missing names and empty search", () => {
  assert.deepEqual(rows.map((r) => r.id), ["1", "2", "3"])
  assert.equal(filterFeedback([email("4", { lead: { icpId: null } })], { ...base, query: "no icp" }, names).length, 1)
  assert.deepEqual(find({ query: "   " }), ["3", "2", "1"])
})
