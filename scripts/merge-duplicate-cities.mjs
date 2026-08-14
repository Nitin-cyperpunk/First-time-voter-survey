/**
 * Execute the approved city merges against live Supabase (DML).
 * Constraints (alias trigger + unique match_key+state) live in 023 SQL.
 */
import { createClient } from "@supabase/supabase-js";

const GROUPS = [
  {
    survivorId: "150b3536-43ee-4e58-83a9-70de5d7394b7",
    survivorName: "Bengaluru",
    foldedId: "8558e1ad-09a6-45ac-8350-83efe784d329",
    foldedName: "Bangalore",
    foldedMatchKey: "bangalore",
    closeIfOver: false,
  },
  {
    survivorId: "71bf0386-cef9-4ebc-a212-527a8fe6aef7",
    survivorName: "Mumbai",
    foldedId: "ca11076f-e248-467d-be06-74ee97df8f89",
    foldedName: "Mumbai (maharahstra)",
    foldedMatchKey: "mumbaimaharahstra",
    closeIfOver: true,
  },
  {
    survivorId: "6163bc55-aee2-4fb8-ba19-b21c47ae6f46",
    survivorName: "Delhi",
    foldedId: "a52fc8e6-50cf-4b82-9d21-a41b4e83d27e",
    foldedName: "New Delhi",
    foldedMatchKey: "newdelhi",
    closeIfOver: false,
  },
];

async function countCompleted(supabase, cityId) {
  const { count, error } = await supabase
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("city_id", cityId)
    .eq("completion_status", "Completed");
  if (error) throw error;
  return count ?? 0;
}

async function mergeGroup(supabase, group) {
  const { data: survivor, error: sErr } = await supabase
    .from("cities")
    .select("id, name, state, capacity, is_open")
    .eq("id", group.survivorId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!survivor) throw new Error(`Survivor missing: ${group.survivorName}`);

  const { data: folded, error: fErr } = await supabase
    .from("cities")
    .select("id, name, state, match_key")
    .eq("id", group.foldedId)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!folded) {
    const resulting = await countCompleted(supabase, group.survivorId);
    return { ...group, skipped: true, reassigned: 0, resulting };
  }

  const before = await countCompleted(supabase, group.survivorId);

  const screener = await supabase
    .from("screener_responses")
    .update({ city_id: group.survivorId })
    .eq("city_id", group.foldedId)
    .select("id");
  if (screener.error) throw screener.error;
  const reassigned = (screener.data ?? []).length;

  const participants = await supabase
    .from("participants")
    .update({ city_id: group.survivorId })
    .eq("city_id", group.foldedId);
  if (participants.error) throw participants.error;

  const ftv = await supabase
    .from("ftv_responses")
    .update({ city_id: group.survivorId })
    .eq("city_id", group.foldedId);
  if (ftv.error && !/PGRST205|schema cache/i.test(ftv.error.message)) {
    throw ftv.error;
  }

  const rePoint = await supabase
    .from("city_aliases")
    .update({ city_id: group.survivorId })
    .eq("city_id", group.foldedId);
  if (rePoint.error) throw rePoint.error;

  const alias = await supabase.from("city_aliases").upsert(
    {
      city_id: group.survivorId,
      alias: group.foldedName,
      match_key: group.foldedMatchKey,
    },
    { onConflict: "match_key" },
  );
  if (alias.error) throw alias.error;

  const remaining = await supabase
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("city_id", group.foldedId);
  if (remaining.error) throw remaining.error;
  if ((remaining.count ?? 0) > 0) {
    throw new Error(`Folded city still has ${remaining.count} screeners`);
  }

  const resulting = await countCompleted(supabase, group.survivorId);
  let closed = false;
  if (group.closeIfOver && resulting > survivor.capacity) {
    const close = await supabase
      .from("cities")
      .update({ is_open: false })
      .eq("id", group.survivorId);
    if (close.error) throw close.error;
    closed = true;
  }

  const del = await supabase.from("cities").delete().eq("id", group.foldedId);
  if (del.error) throw del.error;

  const audit = await supabase.from("config_audit_log").insert({
    actor_id: null,
    actor_email: "system:city-merge",
    entity_type: "city",
    entity_id: group.survivorId,
    field: "city.merge",
    old_value: group.foldedId,
    new_value: `folded ${group.foldedName} into ${group.survivorName}; reassigned ${reassigned}; resulting_count ${resulting}; closed ${closed}`,
  });
  if (audit.error) throw audit.error;

  return {
    ...group,
    skipped: false,
    before,
    reassigned,
    resulting,
    closed,
    overBy: Math.max(0, resulting - survivor.capacity),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count: completesBefore } = await supabase
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("completion_status", "Completed");

  const results = [];
  for (const group of GROUPS) {
    results.push(await mergeGroup(supabase, group));
  }

  const { count: completesAfter } = await supabase
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("completion_status", "Completed");
  const { count: unmatched } = await supabase
    .from("screener_responses")
    .select("*", { count: "exact", head: true })
    .eq("completion_status", "Completed")
    .is("city_id", null);

  const { data: ci } = await supabase
    .from("screener_responses")
    .select("lead_id, city_id, city_raw, city_match_type")
    .eq("lead_id", "CI_FTV_0031")
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        completesBefore,
        completesAfter,
        unmatchedCompletes: unmatched,
        ci_ftv_0031: ci,
        groups: results,
        overLimitResponses: results.reduce((sum, row) => sum + (row.overBy ?? 0), 0),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
