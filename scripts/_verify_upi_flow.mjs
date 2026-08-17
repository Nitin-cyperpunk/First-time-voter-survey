/**
 * Verifies UPI save flow: login -> POST /api/participant/upi -> read back from DB.
 * Usage: node scripts/_verify_upi_flow.mjs [leadId]
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
      ];
    }),
);

const base = "http://localhost:3000";
const leadIdArg = process.argv[2];

import { createClient } from "@supabase/supabase-js";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let participant;
if (leadIdArg) {
  const { data, error } = await sb
    .from("participants")
    .select("lead_id,mobile,dob,upi_id")
    .eq("lead_id", leadIdArg)
    .maybeSingle();
  participant = data;
  if (error) console.error(error);
} else {
  const { data } = await sb
    .from("participants")
    .select("lead_id,mobile,dob,upi_id")
    .not("mobile", "is", null)
    .not("dob", "is", null)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  participant = data;
}

console.log("participant", {
  leadId: participant.lead_id,
  mobile: participant.mobile,
  dob: participant.dob,
  upiBefore: participant.upi_id,
});

if (!participant.mobile || !participant.dob) {
  console.error("participant_missing_mobile_or_dob");
  process.exit(1);
}

if (!participant) {
  console.error("participant_not_found");
  process.exit(1);
}

const leadId = participant.lead_id;

const jar = new Map();

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const part = line.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    mobile: participant.mobile,
    dob: participant.dob,
    rememberMe: false,
  }),
});
storeCookies(loginRes);
const loginBody = await loginRes.json();
console.log("login", loginRes.status, loginBody);

const testUpi = `verify.${Date.now()}@okhdfcbank`;
const upiRes = await fetch(`${base}/api/participant/upi`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookieHeader(),
  },
  body: JSON.stringify({ upiId: testUpi }),
});
const upiBody = await upiRes.json();
console.log("upi_save", upiRes.status, upiBody);

const invalidRes = await fetch(`${base}/api/participant/upi`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookieHeader(),
  },
  body: JSON.stringify({ upiId: "not-a-upi" }),
});
const invalidBody = await invalidRes.json();
console.log("upi_invalid", invalidRes.status, invalidBody);

const dupLead = "CI_FTV_0171";
const { data: p2 } = await sb
  .from("participants")
  .select("mobile,dob")
  .eq("lead_id", dupLead)
  .maybeSingle();

if (p2?.mobile && p2?.dob) {
  const jar2 = new Map();
  const login2 = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: p2.mobile, dob: p2.dob }),
  });
  for (const line of login2.headers.getSetCookie?.() ?? []) {
    const part = line.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar2.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const cookie2 = [...jar2.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const dupRes = await fetch(`${base}/api/participant/upi`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie2 },
    body: JSON.stringify({ upiId: testUpi }),
  });
  console.log("upi_duplicate_handle", dupRes.status, await dupRes.json());
}

const { data: after } = await sb
  .from("participants")
  .select("upi_id,upi_submitted_at")
  .eq("lead_id", leadId)
  .maybeSingle();
console.log("upi_after", after);

const noCookie = await fetch(`${base}/api/participant/upi`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ upiId: testUpi }),
});
console.log("upi_no_session", noCookie.status, await noCookie.json());
