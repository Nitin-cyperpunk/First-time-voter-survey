/**
 * Phase 5.2 — verify dashboard clean card matches shared definition + respondent filter.
 * node scripts/_verify_clean_dashboard_card.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const QUALIFIED = [
  "completed",
  "review_pass",
  "review_fail",
  "successful",
  "unsuccessful",
  "paid",
];

function isCleanForPayout(row) {
  return row.duplicate_flag !== true;
}

function isQcEffectiveFail(status) {
  const s = (status ?? "").toLowerCase();
  return s === "review_fail" || s === "unsuccessful";
}

function isQualifiedCompletionStatus(status) {
  return QUALIFIED.includes((status ?? "").toLowerCase());
}

function isDeliverableClean(row) {
  if (!isQualifiedCompletionStatus(row.status)) return false;
  if (!isCleanForPayout(row)) return false;
  if (isQcEffectiveFail(row.status)) return false;
  return true;
}

function matchesDuplicateFilterClean(row) {
  return isCleanForPayout(row);
}

const { data: rows } = await sb
  .from("participants")
  .select("lead_id, status, duplicate_flag, is_flagged_duplicate")
  .is("deleted_at", null);

const all = rows ?? [];
const deliverable = all.filter(isDeliverableClean);
const cleanFilterAll = all.filter((r) => matchesDuplicateFilterClean(r));
const cleanFilterQualified = all.filter(
  (r) => matchesDuplicateFilterClean(r) && isQualifiedCompletionStatus(r.status),
);

const completed = all.filter((r) => isQualifiedCompletionStatus(r.status)).length;

console.log(
  JSON.stringify(
    {
      cardDefinition_isDeliverableClean: deliverable.length,
      respondentCleanFilter_allStatuses: cleanFilterAll.length,
      respondentCleanFilter_plusQualifiedStatus: cleanFilterQualified.length,
      completed,
      deliverable_lte_completed: deliverable.length <= completed,
      match_card_vs_qualifiedCleanFilter:
        deliverable.length === cleanFilterQualified.length,
    },
    null,
    2,
  ),
);
