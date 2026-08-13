/**
 * Atomic capacity: 10 concurrent Completed inserts at global cap-1 → exactly cap.
 * Also: Terminated does not consume a slot.
 *
 * Requires migration 008 (cities + insert_screener_response_with_capacity).
 * Does not apply migrations. Cleans up test rows afterwards.
 *
 * Usage: node --env-file=.env scripts/test-capacity-concurrency.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TAG = `captest_${Date.now()}`;
const TEST_CITY_NAME = `ZZ Capacity Test ${TAG}`;
const TEST_CITY_STATE = "ZZ-TEST";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function rpcInsert(input) {
  const { data, error } = await supabase.rpc(
    "insert_screener_response_with_capacity",
    {
      p_lead_id: input.leadId,
      p_mobile: input.mobile,
      p_form_version: 1,
      p_answers: {},
      p_completion_status: input.completionStatus,
      p_termination_reason:
        input.completionStatus === "Terminated" ? "capacity_test" : null,
      p_response_times: null,
      p_analytics: null,
      p_csv_row: null,
      p_normalized_export: null,
      p_started_at: new Date().toISOString(),
      p_submitted_at: new Date().toISOString(),
      p_total_duration_sec: 1,
      p_ip_address: "127.0.0.1",
      p_city_id: input.cityId,
      p_self_reported_area_type: null,
    },
  );
  if (error) return { ok: false, code: error.message, error };
  return data ?? { ok: false, code: "empty" };
}

async function countQualified(cityId = null) {
  const { data, error } = await supabase.rpc("count_qualified_completions", {
    p_city_id: cityId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

async function main() {
  const testStartedAt = new Date().toISOString();
  console.log("Capacity concurrency test:", TAG);

  const { data: rpcProbe, error: rpcError } = await supabase.rpc(
    "count_qualified_completions",
    { p_city_id: null },
  );
  if (rpcError) {
    console.error(
      "Migration 008 is not applied (count_qualified_completions missing).",
      rpcError.message,
    );
    process.exit(2);
  }

  const baselineQualified = Number(rpcProbe ?? 0);
  console.log("Baseline qualified completions:", baselineQualified);

  const { data: settingsRow, error: settingsError } = await supabase
    .from("form_settings")
    .select("study_config")
    .eq("form_type", "registration")
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settingsRow) {
    console.error("No form_settings row for registration.");
    process.exit(2);
  }

  const originalConfig = settingsRow.study_config ?? {};
  const leadIds = [];
  let cityId = null;

  try {
    const { data: city, error: cityError } = await supabase
      .from("cities")
      .insert({
        name: TEST_CITY_NAME,
        state: TEST_CITY_STATE,
        area_type: "urban",
        capacity: 100,
        is_active: true,
      })
      .select("id")
      .single();
    if (cityError) throw cityError;
    cityId = city.id;

    const participantRows = Array.from({ length: 11 }, (_, index) => ({
      full_name: `Capacity Test ${index + 1}`,
      mobile: `90000${String(Date.now()).slice(-5)}${String(index).padStart(2, "0")}`.slice(
        0,
        15,
      ),
      dob: "1995-01-15",
      city: TEST_CITY_NAME,
      city_id: cityId,
      referral_code: `CT${TAG.slice(-8)}${String(index).padStart(2, "0")}`.slice(
        0,
        20,
      ),
      status: "lead",
    }));

    const { data: participants, error: participantError } = await supabase
      .from("participants")
      .insert(participantRows)
      .select("lead_id, mobile");
    if (participantError) throw participantError;
    leadIds.push(...participants.map((row) => row.lead_id));

    const terminated = participants[0];
    const concurrent = participants.slice(1, 11);

    const testConfig = {
      ...originalConfig,
      form_status: "open",
      auto_close_on_full: true,
      survey_active: true,
      screener_open: true,
      project_open: true,
      total_capacity: baselineQualified + 1,
    };

    const { error: configError } = await supabase
      .from("form_settings")
      .update({ study_config: testConfig })
      .eq("form_type", "registration");
    if (configError) throw configError;

    const terminatedResult = await rpcInsert({
      leadId: terminated.lead_id,
      mobile: terminated.mobile,
      cityId,
      completionStatus: "Terminated",
    });
    if (!terminatedResult.ok) {
      fail(`Terminated insert should succeed, got ${JSON.stringify(terminatedResult)}`);
    }
    const afterTerminated = await countQualified();
    if (afterTerminated !== baselineQualified) {
      fail(
        `Terminated must not consume capacity: expected ${baselineQualified}, got ${afterTerminated}`,
      );
    } else {
      console.log("OK: Terminated does not consume capacity");
    }

    const results = await Promise.all(
      concurrent.map((row) =>
        rpcInsert({
          leadId: row.lead_id,
          mobile: row.mobile,
          cityId,
          completionStatus: "Completed",
        }),
      ),
    );

    const successes = results.filter((row) => row.ok === true);
    const globalFull = results.filter((row) => row.code === "global_full");
    const finalCount = await countQualified();

    console.log(
      `Concurrent Completed: ${successes.length} ok, ${globalFull.length} global_full, ${results.length - successes.length - globalFull.length} other`,
    );
    console.log("Final qualified count:", finalCount);

    if (successes.length !== 1) {
      fail(`Expected exactly 1 success at cap-1, got ${successes.length}`);
    }
    if (globalFull.length !== 9) {
      fail(`Expected 9 global_full rejects, got ${globalFull.length}`);
    }
    if (finalCount !== baselineQualified + 1) {
      fail(
        `Expected qualified count ${baselineQualified + 1}, got ${finalCount}`,
      );
    }

    const { data: closedSettings, error: closedError } = await supabase
      .from("form_settings")
      .select("study_config")
      .eq("form_type", "registration")
      .maybeSingle();
    if (closedError) throw closedError;
    const closedStatus = closedSettings?.study_config?.form_status;
    if (closedStatus !== "closed") {
      fail(`Expected auto-close form_status=closed, got ${closedStatus}`);
    } else {
      console.log("OK: auto_close_on_full set form_status to closed");
    }

    if (process.exitCode !== 1) {
      console.log("OK: 10 concurrent submits at cap-1 → exact cap");
    }
  } finally {
    if (leadIds.length > 0) {
      await supabase.from("screener_responses").delete().in("lead_id", leadIds);
      await supabase.from("participants").delete().in("lead_id", leadIds);
    }
    if (cityId) {
      await supabase.from("cities").delete().eq("id", cityId);
    }
    await supabase
      .from("form_settings")
      .update({ study_config: originalConfig })
      .eq("form_type", "registration");
    await supabase
      .from("config_audit_log")
      .delete()
      .eq("actor_email", "system")
      .eq("field", "form_status")
      .gte("created_at", testStartedAt);
    console.log("Cleanup complete; study_config restored.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
