import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cellAllocation,
  divideCityTargets,
  divideEqually,
  divideStates,
  maxStatesForCellSize,
  splitStateByArea,
} from "@/lib/quota/allocate";
import { resolveIndiaState, titleCaseCityName } from "@/lib/india-states";

test("odd 50:50 extra unit goes to rural", () => {
  assert.deepEqual(splitStateByArea(67, 50), { urban: 33, rural: 34 });
  assert.deepEqual(splitStateByArea(66, 50), { urban: 33, rural: 33 });
  assert.deepEqual(splitStateByArea(200, 50), { urban: 100, rural: 100 });
});

test("3 states at 200: cells stay at or above 30", () => {
  const states = divideStates(200, ["Maharashtra", "Karnataka", "Tamil Nadu"]);
  assert.equal([...states.values()].reduce((a, b) => a + b, 0), 200);
  for (const alloc of states.values()) {
    const split = splitStateByArea(alloc, 50);
    assert.ok(split.urban >= 30, `urban ${split.urban}`);
    assert.ok(split.rural >= 30, `rural ${split.rural}`);
  }
  assert.equal(maxStatesForCellSize(200), 3);
});

test("verify cascade: 3 states × 2 urban + 1 rural", () => {
  const states = ["Gujarat", "Maharashtra", "Kerala"];
  const alloc = divideStates(200, states);
  // alpha: Gujarat, Kerala, Maharashtra → remainder 2 goes to Gujarat + Kerala
  assert.equal(alloc.get("Gujarat"), 67);
  assert.equal(alloc.get("Kerala"), 67);
  assert.equal(alloc.get("Maharashtra"), 66);

  const mhUrban = cellAllocation({
    stateAllocation: 66,
    urbanPct: 50,
    areaType: "urban",
  });
  const mhRural = cellAllocation({
    stateAllocation: 66,
    urbanPct: 50,
    areaType: "rural",
  });
  assert.equal(mhUrban, 33);
  assert.equal(mhRural, 33);

  const urbanCities = divideCityTargets({
    cellAlloc: mhUrban,
    cities: [
      { name: "Mumbai", buffer: 0 },
      { name: "Pune", buffer: 0 },
    ],
  });
  assert.equal(urbanCities.get("Mumbai")?.target, 17);
  assert.equal(urbanCities.get("Pune")?.target, 16);
  assert.equal(urbanCities.get("Mumbai")?.closesAt, 17);
});

test("city target remainder goes to first alpha name", () => {
  const split = divideEqually(10, ["Pune", "Mumbai", "Nashik"]);
  assert.equal(split.get("Mumbai"), 4);
  assert.equal(split.get("Nashik"), 3);
  assert.equal(split.get("Pune"), 3);
});

test("title-case and Maharashtra typo resolution", () => {
  assert.equal(titleCaseCityName("  pune  "), "Pune");
  assert.equal(titleCaseCityName("new delhi"), "New Delhi");
  assert.equal(resolveIndiaState("maharahstra"), "Maharashtra");
  assert.equal(resolveIndiaState("maharahatra"), "Maharashtra");
  assert.equal(resolveIndiaState("Maharashtra"), "Maharashtra");
});
