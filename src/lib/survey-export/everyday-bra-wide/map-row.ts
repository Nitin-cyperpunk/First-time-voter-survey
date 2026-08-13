import { buildEverydayBraWideHeaders } from "@/lib/survey-export/everyday-bra-wide/headers";
import {
  BRA_TYPES,
  BRANDS,
  CONSENT_HEADER,
  EM_DASH,
  flattenChallengeItems,
  flattenInfoSourceItems,
  META_HEADERS,
  Q14_PERIODS,
  Q15A_OPTIONS,
  Q15B_OPTIONS,
  Q16_STATEMENTS,
  Q22_FEATURES,
  Q8_CHANGE_LABELS,
  wideHeader,
} from "@/lib/survey-export/everyday-bra-wide/questionnaire";

export type EverydayBraWideMeta = {
  leadId: string;
  status?: "complete" | "partial" | "consent_declined";
  surveyVersion?: string;
  startedAt?: string;
  completedAt?: string;
  /** Duration in minutes (sample uses decimal minutes). */
  durationMinutes?: string | number;
  lastScreenReached?: string;
  q16q17TabOrder?: string;
  q22TabOrder?: string;
};

function asList(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "object") return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function asScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  return String(value).trim();
}

function setCell(
  row: Record<string, string>,
  header: string,
  value: string,
) {
  if (!header) return;
  row[header] = value;
}

function selectedSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim().toLowerCase()));
}

function fillMultiSelect(
  row: Record<string, string>,
  qKey: string,
  selected: string[],
  options: string[],
  cellMode: "echo" | "flag" = "echo",
) {
  const set = selectedSet(selected);
  for (const opt of options) {
    const hit = set.has(opt.trim().toLowerCase());
    setCell(
      row,
      wideHeader(qKey, opt),
      hit ? (cellMode === "echo" ? opt : "1") : "",
    );
  }
}

function readIndexed(
  answers: Record<string, unknown>,
  prefix: string,
  index: number,
): unknown {
  return (
    answers[`${prefix}_${index}`] ??
    answers[`${prefix}${index}`] ??
    (typeof answers[prefix] === "object" &&
    answers[prefix] !== null &&
    !Array.isArray(answers[prefix])
      ? (answers[prefix] as Record<string, unknown>)[String(index)]
      : undefined)
  );
}

function otherTypedBrands(answers: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (let n = 1; n <= 3; n++) {
    const text = asScalar(answers[`q2_other${n}`]);
    out.push(text);
  }
  return out;
}

/**
 * Map stored Everyday Bra survey answers jsonb (+ meta) into the 1171-col wide row.
 */
export function mapEverydayBraAnswersToWideRow(
  answers: Record<string, unknown>,
  meta: EverydayBraWideMeta,
): Record<string, string> {
  const headers = buildEverydayBraWideHeaders();
  const row: Record<string, string> = {};
  for (const h of headers) row[h] = "";

  // Meta
  setCell(row, META_HEADERS[0], meta.leadId ?? "");
  setCell(row, META_HEADERS[1], meta.status ?? "complete");
  setCell(row, META_HEADERS[2], meta.surveyVersion ?? "");
  setCell(row, META_HEADERS[3], meta.startedAt ?? "");
  setCell(row, META_HEADERS[4], meta.completedAt ?? "");
  setCell(
    row,
    META_HEADERS[5],
    meta.durationMinutes === undefined || meta.durationMinutes === null
      ? ""
      : String(meta.durationMinutes),
  );
  setCell(row, META_HEADERS[6], meta.lastScreenReached ?? "");
  setCell(row, META_HEADERS[7], meta.q16q17TabOrder ?? "");
  setCell(row, META_HEADERS[8], meta.q22TabOrder ?? "");

  // Consent
  const consent =
    asScalar(answers.consent) ||
    asScalar(answers.Q1) ||
    asScalar(answers.q1);
  // Only treat Q1 as consent when it's Yes/No (not brand recall confusion)
  const consentValue =
    /^(yes|no)$/i.test(consent) ? consent : asScalar(answers.consent);
  setCell(
    row,
    CONSENT_HEADER,
    /^(yes|no)$/i.test(consentValue)
      ? consentValue.charAt(0).toUpperCase() + consentValue.slice(1).toLowerCase()
      : consentValue,
  );

  // Q1 mentions
  const mentions: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const v = asScalar(answers[`q1_brand_${i}`]);
    if (v) mentions.push(v);
  }
  if (mentions.length === 0 && Array.isArray(answers.Q2)) {
    // unlikely
  }
  // Also accept folded array under various keys
  if (mentions.length === 0) {
    for (const key of Object.keys(answers)) {
      if (/^q1_brand_/i.test(key)) {
        const v = asScalar(answers[key]);
        if (v) mentions.push(v);
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    setCell(row, wideHeader("Q1", `Mention ${i + 1}`), mentions[i] ?? "");
  }

  const others = otherTypedBrands(answers);

  // Q2 aware
  const q2Selected = [
    ...asList(answers.q2_aware ?? answers.Q3),
    ...others.filter(Boolean),
  ];
  fillMultiSelect(row, "Q2", q2Selected, [...BRANDS]);
  for (let i = 1; i <= 3; i++) {
    setCell(
      row,
      wideHeader("Q2", `Other brand ${i} (typed)`),
      others[i - 1] ?? "",
    );
  }

  // Q3–Q7 brand multis (field names q3..q7; may also live under sequential Q-keys)
  const brandQMap: Array<{ q: string; fields: string[] }> = [
    { q: "Q3", fields: ["q3", "Q4"] },
    { q: "Q4", fields: ["q4", "Q5"] },
    { q: "Q4b", fields: ["q4b", "Q6"] },
    { q: "Q5", fields: ["q5", "Q7"] },
    { q: "Q6", fields: ["q6", "Q8"] },
    { q: "Q7", fields: ["q7", "Q9"] },
  ];
  for (const { q, fields } of brandQMap) {
    let selected: string[] = [];
    for (const f of fields) {
      const list = asList(answers[f]);
      if (list.length) {
        selected = list;
        break;
      }
    }
    fillMultiSelect(row, q, selected, [...BRANDS]);
    for (let i = 1; i <= 3; i++) {
      const otherText = others[i - 1] ?? "";
      const hit =
        otherText &&
        selected.some((s) => s.toLowerCase() === otherText.toLowerCase());
      setCell(
        row,
        wideHeader(q, `Other brand ${i} (typed in Q2)`),
        hit ? otherText : "",
      );
    }
  }

  // Q8 / Q8a / Q8b / Q9 / Q10 / Q11 / Q12 / Q13 by bra-type index
  for (let i = 0; i < BRA_TYPES.length; i++) {
    const type = BRA_TYPES[i]!;

    const q8raw = asScalar(readIndexed(answers, "q8", i));
    const q8label = Q8_CHANGE_LABELS[q8raw] ?? q8raw;
    setCell(row, wideHeader("Q8", type), q8label);

    const own = asScalar(answers[`q8_${i}_own`]);
    setCell(row, wideHeader("Q8a", type), own);

    const sw = asScalar(answers[`q8_${i}_switch`]);
    setCell(row, wideHeader("Q8b", type), sw);

    const wear = asScalar(answers[`q9_${i}`]);
    setCell(row, wideHeader("Q9", type), wear);

    const brandsForType = asList(answers[`q10_${i}`]);
    for (const brand of BRANDS) {
      const hit = brandsForType.some(
        (b) => b.toLowerCase() === brand.toLowerCase(),
      );
      setCell(row, wideHeader("Q10", type, brand), hit ? brand : "");
    }
    for (let n = 1; n <= 3; n++) {
      const otherText = others[n - 1] ?? "";
      const hit =
        otherText &&
        brandsForType.some((b) => b.toLowerCase() === otherText.toLowerCase());
      setCell(
        row,
        wideHeader("Q10", type, `Other brand ${n} (typed in Q2)`),
        hit ? otherText : "",
      );
    }

    setCell(row, wideHeader("Q11", type), asScalar(answers[`q11_${i}`]));

    const channels = asList(answers[`q12_${i}`]);
    for (const ch of [
      "Exclusive brand store",
      "Multi-brand outlet",
      "E-commerce",
      "Local retail store",
      "Large-format store",
      "Quick commerce",
      "Brand website",
    ]) {
      const hit = channels.some((c) => c.toLowerCase() === ch.toLowerCase());
      setCell(row, wideHeader("Q12", type, ch), hit ? ch : "");
    }

    setCell(row, wideHeader("Q13a", type), asScalar(answers[`q13_${i}`]));
    setCell(row, wideHeader("Q13b", type), asScalar(answers[`q13when_${i}`]));
  }

  // Q14 spend periods q17_1..3
  for (let i = 0; i < Q14_PERIODS.length; i++) {
    setCell(
      row,
      wideHeader("Q14", Q14_PERIODS[i]!),
      asScalar(answers[`q17_${i + 1}`]),
    );
  }

  // Q15a / Q15b
  const q15a = asList(answers.q18a ?? answers.Q19);
  for (const opt of Q15A_OPTIONS) {
    const hit = q15a.some(
      (v) =>
        v.toLowerCase() === opt.value.toLowerCase() ||
        v.toLowerCase() === opt.label.toLowerCase(),
    );
    let cell = hit ? opt.label : "";
    if (opt.value === "Other" && hit) {
      const otherText = asScalar(answers.q18a_other);
      cell = otherText || opt.label;
    }
    setCell(row, wideHeader("Q15a", opt.label), cell);
  }
  const q15b = asList(answers.q18b);
  for (const opt of Q15B_OPTIONS) {
    const hit = q15b.some(
      (v) =>
        v.toLowerCase() === opt.value.toLowerCase() ||
        v.toLowerCase() === opt.label.toLowerCase(),
    );
    let cell = hit ? opt.label : "";
    if (opt.value === "Other" && hit) {
      const otherText = asScalar(answers.q18b_other);
      cell = otherText || opt.label;
    }
    setCell(row, wideHeader("Q15b", opt.label), cell);
  }

  // Q16 / Q17 — indexed by statement position (canonical order fallback)
  for (let i = 0; i < Q16_STATEMENTS.length; i++) {
    const stmt = Q16_STATEMENTS[i]!;
    const imp = asScalar(answers[`q19_${i}`]);
    setCell(row, wideHeader("Q16", stmt), imp);
    const brand = asScalar(answers[`q20_${i}`]);
    setCell(row, wideHeader("Q17", stmt), brand);
  }

  // Q18 / Q19 / Q20 challenges
  const challenges = flattenChallengeItems();
  const q18sel = asList(answers.q21 ?? answers.Q25);
  const q19sel = asList(answers.q22);
  const q20sel = asList(answers.q23a);
  for (const item of challenges) {
    const leaf = item.split(` ${EM_DASH} `).slice(1).join(` ${EM_DASH} `);
    const hit18 = q18sel.some(
      (v) =>
        v.toLowerCase() === leaf.toLowerCase() ||
        v.toLowerCase() === item.toLowerCase(),
    );
    setCell(row, wideHeader("Q18", item), hit18 ? leaf : "");
    const hit19 = q19sel.some(
      (v) =>
        v.toLowerCase() === leaf.toLowerCase() ||
        v.toLowerCase() === item.toLowerCase(),
    );
    setCell(row, wideHeader("Q19", item), hit19 ? leaf : "");
    const hit20 = q20sel.some(
      (v) =>
        v.toLowerCase() === leaf.toLowerCase() ||
        v.toLowerCase() === item.toLowerCase(),
    );
    setCell(row, wideHeader("Q20", item), hit20 ? leaf : "");
  }
  const q18other = asScalar(answers.q21_other);
  setCell(
    row,
    wideHeader("Q18", "Other (please specify)"),
    q18other || (q18sel.includes("Other") ? "Other" : ""),
  );
  const q20other = asScalar(answers.q23a_other);
  setCell(
    row,
    wideHeader("Q20", "Other (please specify)"),
    q20other || (q20sel.includes("Other") ? "Other" : ""),
  );

  // Q21 move-to brands
  const q21sel = asList(answers.q23b);
  for (const brand of BRANDS) {
    if (brand === "Enamor") continue;
    const hit = q21sel.some((b) => b.toLowerCase() === brand.toLowerCase());
    setCell(row, wideHeader("Q21", brand), hit ? brand : "");
  }
  for (let n = 1; n <= 3; n++) {
    const otherText = others[n - 1] ?? "";
    const hit =
      otherText &&
      q21sel.some((b) => b.toLowerCase() === otherText.toLowerCase());
    setCell(
      row,
      wideHeader("Q21", `Other brand ${n} (typed in Q2)`),
      hit ? otherText : "",
    );
  }

  // Q22 WTP
  for (let i = 0; i < Q22_FEATURES.length; i++) {
    setCell(
      row,
      wideHeader("Q22", Q22_FEATURES[i]!),
      asScalar(answers[`q24_${i}`]),
    );
  }

  // Q23 dream brand
  setCell(
    row,
    wideHeader("Q23"),
    asScalar(answers.q25 ?? answers.Q30),
  );

  // Q24 / Q25 sources
  const sources = flattenInfoSourceItems();
  const q24sel = asList(answers.q26 ?? answers.Q31);
  const q25sel = asList(answers.q27);
  for (const src of sources) {
    const leaf = src.split(` ${EM_DASH} `).slice(1).join(` ${EM_DASH} `);
    const hit24 = q24sel.some(
      (v) =>
        v.toLowerCase() === leaf.toLowerCase() ||
        v.toLowerCase() === src.toLowerCase(),
    );
    setCell(row, wideHeader("Q24", src), hit24 ? leaf : "");
    const hit25 = q25sel.some(
      (v) =>
        v.toLowerCase() === leaf.toLowerCase() ||
        v.toLowerCase() === src.toLowerCase(),
    );
    setCell(row, wideHeader("Q25", src), hit25 ? leaf : "");
  }
  const none =
    "I don't usually look for information before buying";
  setCell(
    row,
    wideHeader("Q24", none),
    q24sel.some((v) => v.toLowerCase() === none.toLowerCase()) ? none : "",
  );
  const q24other = asScalar(answers.q26_other);
  setCell(
    row,
    wideHeader("Q24", "Other (please specify)"),
    q24other || (q24sel.includes("Other") ? "Other" : ""),
  );

  setCell(row, wideHeader("Q26"), asScalar(answers.q28 ?? answers.Q33));
  setCell(
    row,
    wideHeader("Q27"),
    asScalar(
      answers.q29 ??
        answers.Q34 ??
        findAnswerByKeyHint(answers, /influencer|creators or online pages/i),
    ),
  );

  // Q28 size — runtime fields q30_band/cup/full, or nested open-multi
  // (schema often stores as Q35: ["32","A","32A"]).
  const size = readBraSizeFields(answers);
  setCell(row, wideHeader("Q28", "Band size"), size.band);
  setCell(row, wideHeader("Q28", "Cup size"), size.cup);
  setCell(row, wideHeader("Q28", "Full size"), size.full);

  return row;
}

function findAnswerByKeyHint(
  answers: Record<string, unknown>,
  hint: RegExp,
): unknown {
  for (const [key, value] of Object.entries(answers)) {
    if (hint.test(key)) return value;
  }
  return undefined;
}

/**
 * Resolve band/cup/full from runtime inputs or nested export shapes.
 * Do not treat scalar Q30/q30 as size — that Q-key is often the dream-brand (Q23).
 */
function readBraSizeFields(answers: Record<string, unknown>): {
  band: string;
  cup: string;
  full: string;
} {
  let band = asScalar(answers.q30_band);
  let cup = asScalar(answers.q30_cup);
  let full = asScalar(answers.q30_full);
  if (band || cup || full) {
    return {
      band,
      cup,
      full: full || (band && cup ? `${band}${cup}` : full),
    };
  }

  const candidates: unknown[] = [];
  for (const [key, value] of Object.entries(answers)) {
    if (
      key === "Q35" ||
      /^Q35\b/i.test(key) ||
      /usual bra size/i.test(key) ||
      key === "q30"
    ) {
      // Only arrays/objects for ambiguous q30 — scalar q30 is not size.
      if (key === "q30" && (typeof value === "string" || typeof value === "number")) {
        continue;
      }
      candidates.push(value);
    }
  }

  for (const value of candidates) {
    if (Array.isArray(value) && value.length > 0) {
      band = asScalar(value[0]);
      cup = asScalar(value[1]);
      full = asScalar(value[2]);
      if (!full && band && cup) full = `${band}${cup}`;
      if (band || cup || full) return { band, cup, full };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      band = asScalar(
        obj.band ?? obj.q30_band ?? obj["Band size"] ?? obj["0"],
      );
      cup = asScalar(obj.cup ?? obj.q30_cup ?? obj["Cup size"] ?? obj["1"]);
      full = asScalar(
        obj.full ?? obj.q30_full ?? obj["Full size"] ?? obj["2"],
      );
      if (!full && band && cup) full = `${band}${cup}`;
      if (band || cup || full) return { band, cup, full };
    }
  }

  return { band: "", cup: "", full: "" };
}

export function emptyEverydayBraWideRow(
  meta: EverydayBraWideMeta,
): Record<string, string> {
  return mapEverydayBraAnswersToWideRow({}, meta);
}
