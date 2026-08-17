/** Verify POST /api/register returns participant_session cookie. */
const base = "http://127.0.0.1:3000";

const body = {
  fullName: "UPI Session Test",
  mobile: `9${String(Date.now()).slice(-9)}`,
  dob: "2003-01-15",
  age_band: "21-25",
  city: "Bengaluru",
  terminated: true,
  terminations: [
    {
      ruleKey: "TERMINATE_NOT_FIRST_TIME",
      ruleLabel: "Not first time",
    },
  ],
  answers: {},
  answerJson: {
    status: "TERMINATE_NOT_FIRST_TIME",
    profile: { city: "Bengaluru", age_band: "21-25" },
  },
  startedAt: new Date(Date.now() - 60000).toISOString(),
  submittedAt: new Date().toISOString(),
};

const res = await fetch(`${base}/api/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text.slice(0, 500) };
}

const cookies = res.headers.getSetCookie?.() ?? [];
const hasSession = cookies.some((c) => c.startsWith("participant_session="));

console.log("register_status", res.status);
console.log("register_body", json);
console.log("has_participant_session_cookie", hasSession);
console.log("set_cookie_lines", cookies);

if (hasSession && json.leadId) {
  const sessionLine = cookies.find((c) => c.startsWith("participant_session="));
  const token = sessionLine.split(";")[0].split("=")[1];
  const upiRes = await fetch(`${base}/api/participant/upi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `participant_session=${token}`,
    },
    body: JSON.stringify({ upiId: `postreg.${Date.now()}@okhdfcbank` }),
  });
  console.log("post_register_upi", upiRes.status, await upiRes.json());
}
