import assert from "node:assert/strict";
import { test } from "node:test";

import { formatExportDate } from "@/lib/survey-export/format-value";

test("formatExportDate matches Enamor sample (IST d/m/yyyy, 12h am/pm)", () => {
  // 28 Jul 2026 10:04:12 IST = 28 Jul 2026 04:34:12 UTC
  assert.equal(
    formatExportDate("2026-07-28T04:34:12.000Z"),
    "28/7/2026, 10:04:12 am",
  );
  // 29 Jul 2026 16:47:29 IST = 29 Jul 2026 11:17:29 UTC
  assert.equal(
    formatExportDate("2026-07-29T11:17:29.000Z"),
    "29/7/2026, 4:47:29 pm",
  );
  assert.equal(formatExportDate(null), "");
  assert.equal(formatExportDate(""), "");
});
