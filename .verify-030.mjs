const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  let v = line.slice(i + 1);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[line.slice(0, i)] = v;
}

async function main() {
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const sel = await sb
    .from("screener_responses")
    .select("completion_status, termination_reason")
    .limit(1);
  console.log("SELECT_COLUMNS:", sel.error ? `ERR ${sel.error.message}` : "OK");

  const any = await sb.from("screener_responses").select("lead_id").limit(1);
  if (!any.data?.[0]) {
    console.log("CHECK_TESTS: SKIP (no rows)");
    return;
  }

  const lead = any.data[0].lead_id;
  const tests = [
    ["Completed", null],
    ["Terminated", "Age not eligible"],
    ["completed", null],
    ["ABC", null],
    ["Pending", null],
  ];

  for (const [status, reason] of tests) {
    const u = await sb
      .from("screener_responses")
      .update({ completion_status: status, termination_reason: reason })
      .eq("lead_id", lead);
    console.log(`CHECK_${status}:`, u.error ? `FAIL ${u.error.message}` : "PASS");
    await sb
      .from("screener_responses")
      .update({ completion_status: null, termination_reason: null })
      .eq("lead_id", lead);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
