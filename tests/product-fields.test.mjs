import {test} from "node:test"
import assert from "node:assert/strict"
import {productFieldKey, productFieldsError} from "../lib/product-fields.ts"
const f = (key,label=key)=>({key,label,value:"Fact"})
test("field keys normalize names and validation catches redundant or reserved fields",()=>{
  assert.equal(productFieldKey(" Target Audience! "),"target_audience")
  assert.equal(productFieldsError([f("features")],[]),"")
  for(const fields of [[f("offer")],[f("a","Pricing or offer")],[f("features"),f("features")],[f("a","Same field"),f("b","same-field")],[f("a","Other"),f("other","Third")],[f("Bad Key")]]) assert.ok(productFieldsError(fields,[]))
})
test("notes reject blanks and duplicates, and permit independent edits or deletion",()=>{
  assert.ok(productFieldsError([],[{id:"1",body:" "}]))
  assert.ok(productFieldsError([],[{id:"1",body:"same note"},{id:"2",body:" SAME  note "}]))
  assert.equal(productFieldsError([],[{id:"1",body:"Updated"},{id:"2",body:"Different"}]),"")
  assert.equal(productFieldsError([],[]),"")
})

import {availableVariables,isKnownVariable} from "../lib/templating.ts"
test("product custom variables and notes are offered only for relevant prompt kinds",()=>{
  for(const kind of ["verify","hook","email","score","followup2","followup3","followup4","followup5"]){
    assert.ok(availableVariables(kind).includes("product.notes"))
    assert.ok(availableVariables(kind).includes("product.details"))
    assert.ok(isKnownVariable("product.custom.target_audience",kind))
    assert.equal(isKnownVariable("product.custom.Bad_Key",kind),false)
  }
  for(const kind of ["sort","sort_people"]) assert.equal(isKnownVariable("product.custom.features",kind),false)
})
