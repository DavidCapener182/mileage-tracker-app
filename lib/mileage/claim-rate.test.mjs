import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_CLAIM_RATE, claimForMiles, parseClaimRate } from "./claim-rate.ts"

test("21p is £0.21, and 255.4 miles claims £53.63", () => {
  assert.equal(DEFAULT_CLAIM_RATE, "0.21")
  assert.equal(claimForMiles("255.4", "0.21"), "53.63")
})

test("missing decimal does not become a £21 rate or a claim", () => {
  for (const rate of ["021", "21", "21.00", "0,21", "0.21junk", "", "1e-2", "-0.21", "Infinity"]) {
    assert.equal(parseClaimRate(rate), null, rate)
    assert.equal(claimForMiles("255.4", rate), null, rate)
  }
})

test("valid existing 25p and 14p rates keep their amounts", () => {
  assert.equal(claimForMiles("255.4", "0.25"), "63.85")
  assert.equal(claimForMiles("82", "0.14"), "11.48")
  assert.equal(claimForMiles("82", ".25"), "20.50")
  assert.equal(claimForMiles("82", "0"), "0.00")
})

test("an invalid or blank distance cannot produce an amount", () => {
  for (const miles of ["", " ", "abc", "-1", "Infinity"]) assert.equal(claimForMiles(miles, "0.21"), null, miles)
})
