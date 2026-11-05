import { test } from "node:test"
import assert from "node:assert/strict"
import { jobPercent, jobDestination } from "../lib/job-progress.ts"

test("reports real per-step progress without inventing unknown totals", () => {
  assert.equal(jobPercent({status: "running", done: 7, total: 20}), 35)
  assert.equal(jobPercent({status: "running", done: 7, total: null}), null)
  assert.equal(jobPercent({status: "queued", done: 0, total: 0}), null)
})
test("clamps invalid counts and reports completion", () => {
  assert.equal(jobPercent({status: "running", done: 99, total: 10}), 100)
  assert.equal(jobPercent({status: "running", done: -1, total: 10}), 0)
  assert.equal(jobPercent({status: "done", done: 1, total: null}), 100)
})
test("retry destinations are local pages, never mutating endpoints", () => {
  assert.equal(jobDestination("/emails/generate"), "/people")
  assert.equal(jobDestination("/pipeline/research"), "/companies")
  assert.equal(jobDestination("/sending/queue"), "/mailboxes")
  assert.equal(jobDestination("/smart-lists/sort"), "/smart-lists")
  assert.equal(jobDestination("https://evil.example"), "/home")
})
