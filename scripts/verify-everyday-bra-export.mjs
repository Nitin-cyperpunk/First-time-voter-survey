/**
 * Three-way verification: form HTML vs generated export headers vs sample CSV.
 * Read-only — writes report JSON under fixtures/survey-export/_verify/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "fixtures/survey-export/_verify");
fs.mkdirSync(outDir, { recursive: true });

function parseCsvLine(line) {
  const headers = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      headers.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  headers.push(cur);
  return headers;
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  );
}

const formPath = path.join(root, "public/form/Everyday Bra — Main Survey.html");
const html = fs.readFileSync(formPath, "utf8");

// Extract screen/question blocks with q-key data attributes and labels.
const questions = [];

// Consent
const consentMatch = html.match(
  /Do you consent to participate in this exercise\?/i,
);
if (consentMatch) {
  questions.push({
    id: "Consent",
    text: "Do you consent to participate in this exercise?",
    source: "html-text",
  });
}

// Find question headings like Q1., Q2. in visible text near data-q / name attrs
const qHeadingRe =
  /\b(Q\d+[a-z]?)\.\s*([^<\n]{10,220}?)(?=<\/|<(?:div|p|span|label|h\d))/gi;
const headingHits = [];
let m;
const htmlNoScript = html.replace(/<script[\s\S]*?<\/script>/gi, "");
while ((m = qHeadingRe.exec(htmlNoScript))) {
  headingHits.push({
    q: m[1].toUpperCase(),
    text: decodeHtml(m[2]).replace(/\s+/g, " ").trim(),
    index: m.index,
  });
}

// Also catch QUESTION_TEXT style from comment blocks / strong labels
const strongQRe =
  /<(?:strong|b|h[1-6]|p|div|span)[^>]*>\s*(Q\d+[a-z]?)\.\s*([^<]{10,300})</gi;
while ((m = strongQRe.exec(htmlNoScript))) {
  headingHits.push({
    q: m[1].toUpperCase(),
    text: decodeHtml(m[2]).replace(/\s+/g, " ").trim(),
    index: m.index,
  });
}

// Deduplicate by Q key keeping longest text
const byQ = new Map();
for (const hit of headingHits) {
  const prev = byQ.get(hit.q);
  if (!prev || hit.text.length > prev.text.length) byQ.set(hit.q, hit);
}

// Input/option extraction helpers per region
function sliceAround(index, before = 500, after = 8000) {
  return htmlNoScript.slice(Math.max(0, index - before), index + after);
}

function extractCheckboxLabels(chunk) {
  const labels = [];
  const re =
    /<label[^>]*>[\s\S]*?<input[^>]*(?:type=["']checkbox["']|type=["']radio["'])[^>]*>[\s\S]*?<\/label>|<input[^>]*(?:type=["']checkbox["']|type=["']radio["'])[^>]*>[\s\S]*?(?:<\/label>|<br|<\/div>)/gi;
  // Simpler: value attrs + nearby text
  const valueRe =
    /<(?:input|option)[^>]*(?:value=["']([^"']+)["'][^>]*|[^>]*value=["']([^"']+)["'])[^>]*>/gi;
  let vm;
  while ((vm = valueRe.exec(chunk))) {
    const v = vm[1] || vm[2];
    if (v && v.length > 0 && v.length < 120 && !/^q\d/i.test(v)) {
      labels.push(decodeHtml(v));
    }
  }
  // data-option / aria
  const dataOpt = /data-(?:option|label|value)=["']([^"']+)["']/gi;
  while ((vm = dataOpt.exec(chunk))) labels.push(decodeHtml(vm[1]));
  return [...new Set(labels)];
}

function extractNameAttrs(chunk) {
  const names = new Set();
  const re = /name=["']([^"']+)["']/gi;
  let nm;
  while ((nm = re.exec(chunk))) names.add(nm[1]);
  return [...names];
}

const formInventory = [];
for (const [q, hit] of [...byQ.entries()].sort((a, b) => {
  const na = a[0].replace(/\D/g, "");
  const nb = b[0].replace(/\D/g, "");
  if (Number(na) !== Number(nb)) return Number(na) - Number(nb);
  return a[0].localeCompare(b[0]);
})) {
  const chunk = sliceAround(hit.index);
  formInventory.push({
    q,
    text: hit.text,
    names: extractNameAttrs(chunk).slice(0, 40),
    optionValues: extractCheckboxLabels(chunk).slice(0, 80),
  });
}

fs.writeFileSync(
  path.join(outDir, "form-headings.json"),
  JSON.stringify({ count: formInventory.length, formInventory }, null, 2),
);

// Sample headers
const sampleCsv = fs.readFileSync(
  path.join(root, "fixtures/survey-export/Enamor_SAMPLE_filled_responses.csv"),
  "utf8",
);
const sampleHeaders = parseCsvLine(sampleCsv.split(/\r?\n/)[0]);
fs.writeFileSync(
  path.join(outDir, "sample-headers.json"),
  JSON.stringify(sampleHeaders, null, 2),
);

// Generated headers via dynamic import of TS through tsx path — use golden + rebuild via require of compiled isn't available.
// Instead parse headers.ts / golden and also invoke via child process with tsx.
const { spawnSync } = await import("node:child_process");
const dumpScript = `
import { buildEverydayBraWideHeaders } from "./src/lib/survey-export/everyday-bra-wide/headers.ts";
import { EVERYDAY_BRA_WIDE_HEADERS } from "./src/lib/survey-export/everyday-bra-wide/golden-headers.ts";
import { QUESTION_TEXT, META_HEADERS, CONSENT_HEADER, BRANDS, BRA_TYPES, Q16_STATEMENTS, Q22_FEATURES, Q15A_OPTIONS, Q15B_OPTIONS, PURCHASE_CHANNELS, Q14_PERIODS, flattenChallengeItems, flattenInfoSourceItems, wideHeader } from "./src/lib/survey-export/everyday-bra-wide/questionnaire.ts";
import { mapEverydayBraAnswersToWideRow } from "./src/lib/survey-export/everyday-bra-wide/map-row.ts";
import fs from "node:fs";

const generated = buildEverydayBraWideHeaders();
const golden = [...EVERYDAY_BRA_WIDE_HEADERS];
const out = {
  generatedCount: generated.length,
  goldenCount: golden.length,
  generated,
  golden,
  diffs: [],
};
const max = Math.max(generated.length, golden.length);
for (let i = 0; i < max; i++) {
  if (generated[i] !== golden[i]) {
    out.diffs.push({ i, generated: generated[i] ?? null, golden: golden[i] ?? null });
  }
}

// Group generated headers by Q prefix
function qKeyFromHeader(h) {
  if (META_HEADERS.includes(h)) return "META";
  if (h === CONSENT_HEADER || h.startsWith("Consent.")) return "Consent";
  const m = h.match(/^(Q\\d+[a-z]?)\\./);
  return m ? m[1] : "OTHER";
}

const byKey = {};
for (const h of generated) {
  const k = qKeyFromHeader(h);
  (byKey[k] ??= []).push(h);
}

const sample = JSON.parse(fs.readFileSync("fixtures/survey-export/_verify/sample-headers.json","utf8"));
const sampleByKey = {};
for (const h of sample) {
  const k = qKeyFromHeader(h);
  (sampleByKey[k] ??= []).push(h);
}

const allKeys = [...new Set([...Object.keys(byKey), ...Object.keys(sampleByKey)])];
const perQuestion = allKeys.map((k) => {
  const gen = byKey[k] ?? [];
  const samp = sampleByKey[k] ?? [];
  const missing = samp.filter((h) => !gen.includes(h));
  const extra = gen.filter((h) => !samp.includes(h));
  const misordered =
    missing.length === 0 &&
    extra.length === 0 &&
    gen.some((h, i) => h !== samp[i]);
  let status = "PASS";
  if (missing.length || extra.length) status = "DIFF";
  else if (misordered) status = "MISORDERED";
  return {
    q: k,
    expectedCols: samp.length,
    actualCols: gen.length,
    status,
    missing: missing.slice(0, 20),
    extra: extra.slice(0, 20),
    missingCount: missing.length,
    extraCount: extra.length,
    firstGen: gen[0] ?? null,
    firstSamp: samp[0] ?? null,
  };
});

// Form QUESTION_TEXT keys used by generator
const questionnaireKeys = Object.keys(QUESTION_TEXT);

// Spot-check mapping
const spot = mapEverydayBraAnswersToWideRow(
  {
    consent: "Yes",
    q1_brand_1: "Enamor",
    q1_brand_2: "Jockey",
    q2_aware: ["Enamor", "Jockey", "Zudio"],
    q2_other1: "Local Boutique",
    q3: ["Enamor", "Jockey"],
    q8_0: "1",
    q8_1: "5",
    q8_0_own: "4",
    q10_0: ["Enamor", "Jockey"],
    q12_0: ["E-commerce"],
    q15a: ["Switched expensive", "Other"],
    q15a_other: "Custom reason",
    q16_0: "5",
    q18a: ["Switched expensive"],
    q21: ["Jockey", "Zudio"],
    q22_0: "3",
    q23: "open text answer",
    q28: "26",
    q29: "34B preferred",
    q30_band: "34",
    q30_cup: "B",
    q30_full: "34B",
  },
  {
    leadId: "ENM-SPOT",
    status: "complete",
    surveyVersion: "v5",
    durationMinutes: 12.5,
    lastScreenReached: "s-m13",
  },
);

const spotChecks = [
  { label: "meta.leadId", col: "Respondent ID", expected: "ENM-SPOT", actual: spot["Respondent ID"] },
  { label: "consent", col: "Consent. Do you consent to participate in this exercise?", expected: "Yes", actual: spot["Consent. Do you consent to participate in this exercise?"] },
  { label: "Q1 mention1", col: wideHeader("Q1","Mention 1"), expected: "Enamor", actual: spot[wideHeader("Q1","Mention 1")] },
  { label: "Q2 Enamor", col: wideHeader("Q2","Enamor"), expected: "Enamor", actual: spot[wideHeader("Q2","Enamor")] },
  { label: "Q2 other typed", col: wideHeader("Q2","Other brand 1 (typed)"), expected: "Local Boutique", actual: spot[wideHeader("Q2","Other brand 1 (typed)")] },
  { label: "Q8 T-shirt", col: wideHeader("Q8","T-shirt bra"), expected: "Buy more now", actual: spot[wideHeader("Q8","T-shirt bra")] },
  { label: "Q10 Enamor", col: wideHeader("Q10","T-shirt bra","Enamor"), expected: "Enamor", actual: spot[wideHeader("Q10","T-shirt bra","Enamor")] },
  { label: "Q12 channel", col: wideHeader("Q12","T-shirt bra","E-commerce"), expected: "E-commerce", actual: spot[wideHeader("Q12","T-shirt bra","E-commerce")] },
  { label: "Q15a label", col: wideHeader("Q15a","I switched to a more expensive brand"), expected: "I switched to a more expensive brand", actual: spot[wideHeader("Q15a","I switched to a more expensive brand")] },
  { label: "Q16 rating", col: wideHeader("Q16","Comfortable to wear all day"), expected: "5", actual: spot[wideHeader("Q16","Comfortable to wear all day")] },
  { label: "Q21 Jockey", col: wideHeader("Q21","Jockey"), expected: "Jockey", actual: spot[wideHeader("Q21","Jockey")] },
  { label: "Q22 feature", col: wideHeader("Q22", Q22_FEATURES[0]), expected: "3", actual: spot[wideHeader("Q22", Q22_FEATURES[0])] },
  { label: "Q23 open", col: wideHeader("Q23"), expected: "open text answer", actual: spot[wideHeader("Q23")] },
  { label: "Q28 band", col: wideHeader("Q28","Band size"), expected: "34", actual: spot[wideHeader("Q28","Band size")] },
  { label: "Q28 cup", col: wideHeader("Q28","Cup size"), expected: "B", actual: spot[wideHeader("Q28","Cup size")] },
  { label: "Q28 full", col: wideHeader("Q28","Full size"), expected: "34B", actual: spot[wideHeader("Q28","Full size")] },
];

fs.writeFileSync("fixtures/survey-export/_verify/export-vs-sample.json", JSON.stringify({
  generatedCount: generated.length,
  goldenCount: golden.length,
  sampleCount: sample.length,
  genVsGoldenDiffs: out.diffs.length,
  genVsSampleDiffs: (() => {
    const d=[];
    for (let i=0;i<Math.max(generated.length,sample.length);i++){
      if(generated[i]!==sample[i]) d.push({i,generated:generated[i]??null,sample:sample[i]??null});
    }
    return d.length;
  })(),
  perQuestion,
  questionnaireKeys,
  brands: BRANDS,
  braTypes: BRA_TYPES,
  q16Count: Q16_STATEMENTS.length,
  q22Count: Q22_FEATURES.length,
  challengeItems: flattenChallengeItems().length,
  infoSources: flattenInfoSourceItems().length,
  spotChecks,
  spotPass: spotChecks.every(s => String(s.actual) === String(s.expected)),
}, null, 2));

console.log(JSON.stringify({
  generated: generated.length,
  sample: sample.length,
  golden: golden.length,
  genVsGolden: out.diffs.length,
  perQ: perQuestion.filter(p => p.status !== "PASS").length,
  spotPass: spotChecks.every(s => String(s.actual) === String(s.expected)),
}, null, 2));
`;

fs.writeFileSync(path.join(outDir, "_dump.mts"), dumpScript);
const r = spawnSync(
  "npx",
  ["tsx", path.join(outDir, "_dump.mts")],
  { cwd: root, encoding: "utf8", shell: true },
);
console.log(r.stdout);
if (r.stderr) console.error(r.stderr);
if (r.status !== 0) {
  console.error("dump failed", r.status);
  process.exit(r.status || 1);
}

console.log("Wrote", outDir);
