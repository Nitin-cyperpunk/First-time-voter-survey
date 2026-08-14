import assert from "node:assert/strict";
import { test } from "node:test";

import { cityMatchKey, normalizeCityDisplayName } from "@/lib/city-resolve";

test("cityMatchKey strips case, space, punctuation", () => {
  assert.equal(cityMatchKey(" Mumbai "), "mumbai");
  assert.equal(cityMatchKey("MUMBAI"), "mumbai");
  assert.equal(cityMatchKey("New Delhi"), "newdelhi");
  assert.equal(cityMatchKey("St. Louis"), "stlouis");
});

test("normalizeCityDisplayName title-cases", () => {
  assert.equal(normalizeCityDisplayName("  mumbai  "), "Mumbai");
  assert.equal(normalizeCityDisplayName("new delhi"), "New Delhi");
});
