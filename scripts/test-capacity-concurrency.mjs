/**
 * Capacity RPC checks after migration 020:
 *   - enforce_capacity false: over-reference completes succeed, no auto-close,
 *     terminates increment nothing.
 *   - enforce_capacity true: original city/cell/state/study rejects + auto-close.
 *   - form_status closed: reject without started_at; allow mid-survey finish.
 *
 * Does not apply migrations. Restores study_config afterwards.
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
      p_started_at:
        input.startedAt === null ? null : (input.startedAt ?? new Date().toISOString()),
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

async function writeConfig(config) {
  const { error } = await supabase
    .from("form_settings")
    .update({ study_config: config })
    .eq("form_type", "registration");
  if (error) throw error;
}

async function readFormStatus() {
  const { data, error } = await supabase
    .from("form_settings")
    .select("study_config")
    .eq("form_type", "registration")
    .maybeSingle();
  if (error) throw error;
  return data?.study_config?.form_status ?? null;
}

async function main() {
  const testStartedAt = new Date().toISOString();
  console.log("Capacity RPC test:", TAG);

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
        capacity: 1,
        is_active: true,
        is_open: true,
      })
      .select("id")
      .single();
    if (cityError) throw cityError;
    cityId = city.id;

    const participantRows = Array.from({ length: 18 }, (_, index) => ({
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
    const overReference = participants.slice(1, 6);
    const closedFresh = participants[6];
    const closedMid = participants[7];
    const concurrent = participants.slice(8, 18);

    await writeConfig({
      ...originalConfig,
      form_status: "open",
      enforce_capacity: false,
      auto_close_on_full: true,
      survey_active: true,
      screener_open: true,
      project_open: true,
      total_capacity: baselineQualified + 1,
    });

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
      console.log("OK: Terminated does not increment counts");
    }

    const offResults = [];
    for (const row of overReference) {
      offResults.push(
        await rpcInsert({
          leadId: row.lead_id,
          mobile: row.mobile,
          cityId,
          completionStatus: "Completed",
        }),
      );
    }
    const offOk = offResults.filter((row) => row.ok === true);
    const offRejects = offResults.filter((row) => row.ok !== true);
    const cityCount = await countQualified(cityId);
    const afterOff = await countQualified();
    const statusAfterOff = await readFormStatus();

    console.log(
      `enforce_capacity=false: ${offOk.length}/5 completes, city achieved ${cityCount} vs reference 1, study ${afterOff} vs reference ${baselineQualified + 1}`,
    );
    if (offOk.length !== 5) {
      fail(`Expected 5 over-reference completes to succeed, got ${offOk.length}`);
    }
    if (offRejects.length > 0) {
      fail(`Unexpected rejects while enforcement is off: ${JSON.stringify(offRejects)}`);
    }
    if (cityCount !== 5) {
      fail(`Expected city count 5 against reference 1, got ${cityCount}`);
    }
    if (afterOff !== baselineQualified + 5) {
      fail(`Expected study total ${baselineQualified + 5}, got ${afterOff}`);
    }
    if (statusAfterOff !== "open") {
      fail(`Auto-close must stay off when enforce_capacity is false, got ${statusAfterOff}`);
    } else {
      console.log("OK: over-reference completes succeed and form does not auto-close");
    }

    await writeConfig({
      ...originalConfig,
      form_status: "closed",
      enforce_capacity: false,
      auto_close_on_full: false,
      survey_active: true,
      screener_open: true,
      project_open: true,
      total_capacity: baselineQualified + 200,
    });

    const freshClosed = await rpcInsert({
      leadId: closedFresh.lead_id,
      mobile: closedFresh.mobile,
      cityId,
      completionStatus: "Completed",
      startedAt: null,
    });
    if (freshClosed.ok || freshClosed.code !== "form_closed") {
      fail(
        `Fresh submit while closed should be form_closed, got ${JSON.stringify(freshClosed)}`,
      );
    } else {
      console.log("OK: closed form rejects new submit with form_closed");
    }

    const midClosed = await rpcInsert({
      leadId: closedMid.lead_id,
      mobile: closedMid.mobile,
      cityId,
      completionStatus: "Completed",
      startedAt: new Date().toISOString(),
    });
    if (!midClosed.ok) {
      fail(`Mid-survey submit while closed should succeed, got ${JSON.stringify(midClosed)}`);
    } else {
      console.log("OK: mid-survey (started_at set) may finish after close");
    }

    await supabase.from("screener_responses").delete().in("lead_id", leadIds);
    const resetQualified = await countQualified();
    if (resetQualified !== baselineQualified) {
      fail(
        `Cleanup before enforce-on phase expected ${baselineQualified}, got ${resetQualified}`,
      );
    }

    const { error: raiseCityError } = await supabase
      .from("cities")
      .update({ capacity: 100 })
      .eq("id", cityId);
    if (raiseCityError) throw raiseCityError;

    await writeConfig({
      ...originalConfig,
      form_status: "open",
      enforce_capacity: true,
      auto_close_on_full: true,
      survey_active: true,
      screener_open: true,
      project_open: true,
      total_capacity: baselineQualified + 1,
    });

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
    const globalFull = results.filter(
      (row) => row.code === "global_full" || row.code === "study_full",
    );
    const finalCount = await countQualified();
    const closedStatus = await readFormStatus();

    console.log(
      `enforce_capacity=true: ${successes.length} ok, ${globalFull.length} study_full, final ${finalCount}`,
    );

    if (successes.length !== 1) {
      fail(`Expected exactly 1 success at cap-1, got ${successes.length}`);
    }
    if (globalFull.length !== 9) {
      fail(`Expected 9 study_full rejects, got ${globalFull.length}`);
    }
    if (finalCount !== baselineQualified + 1) {
      fail(
        `Expected qualified count ${baselineQualified + 1}, got ${finalCount}`,
      );
    }
    if (closedStatus !== "closed") {
      fail(`Expected auto-close form_status=closed, got ${closedStatus}`);
    } else {
      console.log("OK: flipping enforce_capacity true restores rejects and auto-close");
    }

    if (process.exitCode !== 1) {
      console.log("OK: enforcement off keeps counting; enforcement on restores cascade");
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
