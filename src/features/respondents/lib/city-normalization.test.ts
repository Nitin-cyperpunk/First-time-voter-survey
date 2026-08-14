import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateNormalizedCitiesSplit } from "@/features/respondents/lib/city-normalization";

test("splits completes from all participants after alias collapse", () => {
  const rows = aggregateNormalizedCitiesSplit([
    { city: "Bangalore", qualified: true },
    { city: "Bengaluru", qualified: true },
    { city: "bangalore", qualified: false },
    { city: "Mumbai", qualified: true },
  ]);
  const bengaluru = rows.find((row) => row.label === "Bengaluru");
  const mumbai = rows.find((row) => row.label === "Mumbai");
  assert.equal(bengaluru?.completes, 2);
  assert.equal(bengaluru?.allParticipants, 3);
  assert.equal(mumbai?.completes, 1);
  assert.equal(mumbai?.allParticipants, 1);
});
