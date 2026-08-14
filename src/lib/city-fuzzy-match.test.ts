import assert from "node:assert/strict";
import test from "node:test";

import { fuzzyMatchScore, rankCitySuggestions } from "@/lib/city-fuzzy-match";

test("fuzzyMatchScore ranks bengaluru near bangalore", () => {
  assert.ok(fuzzyMatchScore("bengaluru", "bangalore") >= 45);
  assert.equal(fuzzyMatchScore("bengaluru", "bengaluru"), 100);
});

test("rankCitySuggestions returns likely candidates without auto-apply semantics", () => {
  const ranked = rankCitySuggestions(
    "bengaluru",
    [
      {
        id: "1",
        name: "Bangalore",
        state: "Karnataka",
        areaType: "urban",
        matchKey: "bangalore",
      },
      {
        id: "2",
        name: "Mumbai",
        state: "Maharashtra",
        areaType: "urban",
        matchKey: "mumbai",
      },
    ],
    [],
  );
  assert.equal(ranked[0]?.cityId, "1");
  assert.ok(ranked[0]?.score >= 45);
});
