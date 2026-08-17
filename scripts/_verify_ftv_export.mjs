import { listFtvExportBundle } from "../src/server/repositories/ftv-export.repository.ts";

const bundle = await listFtvExportBundle();
console.log("row count:", bundle.rows.length);
console.log("header count:", bundle.headers.length);
console.log("last 5 headers:", bundle.headers.slice(-5).join("|"));
console.log(
  "first 5 headers unchanged:",
  bundle.headers.slice(0, 5).join("|"),
);

const dup = bundle.rows.find((row) => row.duplicate_flag === "Yes");
const clean = bundle.rows.find(
  (row) => !row.duplicate_flag && row.status === "COMPLETE",
);
const terminated = bundle.rows.find((row) =>
  String(row.status ?? "").startsWith("TERMINATE"),
);

for (const [label, row] of [
  ["duplicate", dup],
  ["clean", clean],
  ["terminated", terminated],
]) {
  if (!row) {
    console.log(`${label}: not found`);
    continue;
  }
  console.log(
    `${label}:`,
    JSON.stringify({
      respondent_id: row.respondent_id,
      status: row.status,
      duplicate_flag: row.duplicate_flag,
      duplicate_match_type: row.duplicate_match_type,
      duplicate_matched_lead_id: row.duplicate_matched_lead_id,
    }),
  );
}
