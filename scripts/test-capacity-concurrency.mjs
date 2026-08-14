/**
 * Per-city cap of 12 after migration 021:
 *   - 11 then 12th succeed; 13th is city_full
 *   - 10 concurrent submits at count 11 → exactly 12
 *   - city already at 20 keeps all 20; new completes are city_full
 *   - terminate on a full city records and increments nothing
 *   - no study_full / auto-close when global is past the reference N
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

const TAG = `cap12_${Date.now()}`;
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
      p_city_id: input.cityId ?? null,
      p_self_reported_area_type: null,
      p_city_raw: input.cityRaw ?? "Test City",
      p_city_match_type: input.matchType ?? (input.cityId ? "exact" : "unmatched"),
    },
  );
  if (error) return { ok: false, code: error.message, error };
  return data ?? { ok: false, code: "empty" };
}

async function countQualified(cityId = null) {
  const { data, error } = await supabase.rpc("count_qualified_completions", {
    p_city_id: cityId,
    p_state: null,
    p_area_type: null,
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

async function insertCity(name, capacity) {
  const { data, error } = await supabase
    .from("cities")
    .insert({
      name,
      state: TEST_CITY_STATE,
      area_type: "urban",
      capacity,
      buffer: 0,
      is_active: true,
      is_open: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertParticipants(count, cityId, cityName) {
  const rows = Array.from({ length: count }, (_, index) => {
    const row = {
      full_name: `Capacity 12 Test ${index + 1}`,
      mobile: `91${String(Date.now()).slice(-8)}${String(index).padStart(3, "0")}`.slice(
        0,
        15,
      ),
      dob: "1995-01-15",
      city: cityName,
      referral_code: `C12${TAG.slice(-6)}${String(index).padStart(3, "0")}`.slice(0, 20),
      status: "lead",
    };
    if (cityId) row.city_id = cityId;
    return row;
  });
  const { data, error } = await supabase
    .from("participants")
    .insert(rows)
    .select("lead_id, mobile");
  if (error) throw error;
  return data;
}

async function main() {
  console.log("City capacity 12 RPC test:", TAG);

  const { error: rpcError } = await supabase.rpc("count_qualified_completions", {
    p_city_id: null,
  });
  if (rpcError) {
    console.error("count_qualified_completions missing.", rpcError.message);
    process.exit(2);
  }

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
  const cityIds = [];

  try {
    await writeConfig({
      ...originalConfig,
      form_status: "open",
      enforce_capacity: true,
      enforce_quota_cascade: false,
      auto_close_on_full: false,
      default_city_capacity: 12,
      total_capacity: 1,
    });

    const seqCityName = `ZZ Cap12 Seq ${TAG}`;
    const seqCityId = await insertCity(seqCityName, 12);
    cityIds.push(seqCityId);
    const seqPeople = await insertParticipants(14, seqCityId, seqCityName);
    leadIds.push(...seqPeople.map((row) => row.lead_id));

    for (let i = 0; i < 12; i += 1) {
      const result = await rpcInsert({
        leadId: seqPeople[i].lead_id,
        mobile: seqPeople[i].mobile,
        cityId: seqCityId,
        completionStatus: "Completed",
      });
      if (!result.ok) {
        fail(`Complete ${i + 1}/12 should succeed, got ${JSON.stringify(result)}`);
      }
    }
    const after12 = await countQualified(seqCityId);
    if (after12 !== 12) fail(`Expected 12 after sequential fills, got ${after12}`);
    else console.log("OK: 12 sequential completes accepted");

    const thirteenth = await rpcInsert({
      leadId: seqPeople[12].lead_id,
      mobile: seqPeople[12].mobile,
      cityId: seqCityId,
      completionStatus: "Completed",
    });
    if (thirteenth.ok || thirteenth.code !== "city_full") {
      fail(`13th should be city_full, got ${JSON.stringify(thirteenth)}`);
    } else {
      console.log("OK: 13th rejected with city_full");
    }
    if ((await countQualified(seqCityId)) !== 12) {
      fail("13th reject must not increment the city count");
    }

    const terminated = await rpcInsert({
      leadId: seqPeople[13].lead_id,
      mobile: seqPeople[13].mobile,
      cityId: seqCityId,
      completionStatus: "Terminated",
    });
    if (!terminated.ok) {
      fail(`Terminate on a full city should record, got ${JSON.stringify(terminated)}`);
    }
    if ((await countQualified(seqCityId)) !== 12) {
      fail("Terminate must not increment qualified count");
    } else {
      console.log("OK: terminate on a full city records and increments nothing");
    }

    const concCityName = `ZZ Cap12 Conc ${TAG}`;
    const concCityId = await insertCity(concCityName, 12);
    cityIds.push(concCityId);
    const concPeople = await insertParticipants(21, concCityId, concCityName);
    leadIds.push(...concPeople.map((row) => row.lead_id));

    for (let i = 0; i < 11; i += 1) {
      const result = await rpcInsert({
        leadId: concPeople[i].lead_id,
        mobile: concPeople[i].mobile,
        cityId: concCityId,
        completionStatus: "Completed",
      });
      if (!result.ok) {
        fail(`Pre-fill ${i + 1}/11 should succeed, got ${JSON.stringify(result)}`);
      }
    }

    const concurrent = concPeople.slice(11, 21);
    const results = await Promise.all(
      concurrent.map((row) =>
        rpcInsert({
          leadId: row.lead_id,
          mobile: row.mobile,
          cityId: concCityId,
          completionStatus: "Completed",
        }),
      ),
    );
    const successes = results.filter((row) => row.ok === true);
    const cityFull = results.filter((row) => row.code === "city_full");
    const concFinal = await countQualified(concCityId);
    console.log(
      `CONCURRENCY at count 11: ${successes.length} ok, ${cityFull.length} city_full, final ${concFinal}`,
    );
    if (successes.length !== 1) {
      fail(`Expected exactly 1 concurrent success, got ${successes.length}`);
    }
    if (cityFull.length !== 9) {
      fail(`Expected 9 city_full rejects, got ${cityFull.length}`);
    }
    if (concFinal !== 12) {
      fail(`Expected final city count 12, got ${concFinal}`);
    } else {
      console.log("OK: 10 simultaneous submits at 11 produced exactly 12");
    }

    const overCityName = `ZZ Cap12 Over ${TAG}`;
    const overCityId = await insertCity(overCityName, 12);
    cityIds.push(overCityId);
    const overPeople = await insertParticipants(21, overCityId, overCityName);
    leadIds.push(...overPeople.map((row) => row.lead_id));

    await writeConfig({
      ...originalConfig,
      form_status: "open",
      enforce_capacity: false,
      enforce_quota_cascade: false,
      auto_close_on_full: false,
      default_city_capacity: 12,
      total_capacity: 1,
    });
    for (let i = 0; i < 20; i += 1) {
      const result = await rpcInsert({
        leadId: overPeople[i].lead_id,
        mobile: overPeople[i].mobile,
        cityId: overCityId,
        completionStatus: "Completed",
      });
      if (!result.ok) {
        fail(`Over-limit seed ${i + 1}/20 should succeed, got ${JSON.stringify(result)}`);
      }
    }
    const seeded20 = await countQualified(overCityId);
    if (seeded20 !== 20) fail(`Expected 20 seeded completes, got ${seeded20}`);

    await writeConfig({
      ...originalConfig,
      form_status: "open",
      enforce_capacity: true,
      enforce_quota_cascade: false,
      auto_close_on_full: false,
      default_city_capacity: 12,
      total_capacity: 1,
    });
    const twentyFirst = await rpcInsert({
      leadId: overPeople[20].lead_id,
      mobile: overPeople[20].mobile,
      cityId: overCityId,
      completionStatus: "Completed",
    });
    if (twentyFirst.ok || twentyFirst.code !== "city_full") {
      fail(`City at 20 must reject new completes, got ${JSON.stringify(twentyFirst)}`);
    }
    if ((await countQualified(overCityId)) !== 20) {
      fail("Existing 20 completes must stay intact");
    } else {
      console.log("OK: city at 20 keeps all 20 and accepts nothing new");
    }

    const globalBefore = await countQualified();
    const unmatchedPerson = await insertParticipants(1, null, "Typo City");
    leadIds.push(unmatchedPerson[0].lead_id);
    const unmatched = await rpcInsert({
      leadId: unmatchedPerson[0].lead_id,
      mobile: unmatchedPerson[0].mobile,
      cityId: null,
      cityRaw: "Typo City XYZ",
      matchType: "unmatched",
      completionStatus: "Completed",
    });
    if (!unmatched.ok) {
      fail(`Unmatched complete should bypass city cap, got ${JSON.stringify(unmatched)}`);
    } else {
      console.log("OK: unmatched complete bypasses per-city limit");
    }

    const globalAfter = await countQualified();
    if (globalAfter !== globalBefore + 1) {
      fail(`Unmatched should add 1 to study total: ${globalBefore} → ${globalAfter}`);
    }

    const { data: formRow } = await supabase
      .from("form_settings")
      .select("study_config")
      .eq("form_type", "registration")
      .maybeSingle();
    const status = formRow?.study_config?.form_status;
    if (status !== "open") {
      fail(`Form must stay open with no auto-close, got ${status}`);
    } else {
      console.log("OK: submissions continue with no auto-close (form still open)");
    }

    if (process.exitCode !== 1) {
      console.log("OK: city cap 12, unmatched open, no global auto-close");
    }
  } finally {
    if (leadIds.length > 0) {
      await supabase.from("screener_responses").delete().in("lead_id", leadIds);
      await supabase.from("participants").delete().in("lead_id", leadIds);
    }
    for (const id of cityIds) {
      await supabase.from("cities").delete().eq("id", id);
    }
    await supabase
      .from("form_settings")
      .update({ study_config: originalConfig })
      .eq("form_type", "registration");
    console.log("Cleanup complete; study_config restored.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
