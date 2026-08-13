import fs from "node:fs";

const headers = JSON.parse(
  fs.readFileSync("fixtures/survey-export/sample-headers.json", "utf8"),
).map((h) => h.replace(/^\ufeff/, ""));

const body = `/**
 * Authoritative Everyday Bra survey wide-format headers (1171 cols).
 * Generated from fixtures/survey-export/Enamor_SAMPLE_filled_responses.csv.
 * Do not hand-edit — regenerate via scripts/generate-golden-headers.mjs
 */
export const EVERYDAY_BRA_WIDE_HEADERS: readonly string[] = ${JSON.stringify(
  headers,
  null,
  2,
)} as const;

export const EVERYDAY_BRA_WIDE_COLUMN_COUNT = EVERYDAY_BRA_WIDE_HEADERS.length;
`;

fs.mkdirSync("src/lib/survey-export/everyday-bra-wide", { recursive: true });
fs.writeFileSync(
  "src/lib/survey-export/everyday-bra-wide/golden-headers.ts",
  body,
);
console.log("wrote", headers.length, "headers");
