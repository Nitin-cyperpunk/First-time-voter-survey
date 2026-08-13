import {
  BRANDS,
  BRA_TYPES,
  CONSENT_HEADER,
  flattenChallengeItems,
  flattenInfoSourceItems,
  META_HEADERS,
  PURCHASE_CHANNELS,
  Q14_PERIODS,
  Q15A_OPTIONS,
  Q15B_OPTIONS,
  Q16_STATEMENTS,
  Q22_FEATURES,
  wideHeader,
} from "@/lib/survey-export/everyday-bra-wide/questionnaire";

function brandMultiHeaders(
  qKey: string,
  otherLabel: "typed" | "typed in Q2",
): string[] {
  const headers = BRANDS.map((brand) => wideHeader(qKey, brand));
  for (let i = 1; i <= 3; i++) {
    headers.push(
      wideHeader(
        qKey,
        otherLabel === "typed"
          ? `Other brand ${i} (typed)`
          : `Other brand ${i} (typed in Q2)`,
      ),
    );
  }
  return headers;
}

/**
 * Deterministic wide header list generated from the questionnaire definition.
 * Must match Enamor_SAMPLE_filled_responses.csv (1171 columns).
 */
export function buildEverydayBraWideHeaders(): string[] {
  const headers: string[] = [...META_HEADERS, CONSENT_HEADER];

  // Q1 mentions
  for (let i = 1; i <= 6; i++) {
    headers.push(wideHeader("Q1", `Mention ${i}`));
  }

  // Q2–Q7 brand multi-selects
  headers.push(...brandMultiHeaders("Q2", "typed"));
  for (const q of ["Q3", "Q4", "Q4b", "Q5", "Q6", "Q7"] as const) {
    headers.push(...brandMultiHeaders(q, "typed in Q2"));
  }

  // Q8 / Q8a / Q8b / Q9 single-response matrices by bra type
  for (const row of BRA_TYPES) headers.push(wideHeader("Q8", row));
  for (const row of BRA_TYPES) headers.push(wideHeader("Q8a", row));
  for (const row of BRA_TYPES) headers.push(wideHeader("Q8b", row));
  for (const row of BRA_TYPES) headers.push(wideHeader("Q9", row));

  // Q10 two-dim: bra type × brand (+ other typed-in-Q2)
  for (const row of BRA_TYPES) {
    for (const brand of BRANDS) {
      headers.push(wideHeader("Q10", row, brand));
    }
    for (let i = 1; i <= 3; i++) {
      headers.push(wideHeader("Q10", row, `Other brand ${i} (typed in Q2)`));
    }
  }

  // Q11 price by bra type
  for (const row of BRA_TYPES) headers.push(wideHeader("Q11", row));

  // Q12 two-dim: bra type × channel
  for (const row of BRA_TYPES) {
    for (const channel of PURCHASE_CHANNELS) {
      headers.push(wideHeader("Q12", row, channel));
    }
  }

  // Q13a / Q13b
  for (const row of BRA_TYPES) headers.push(wideHeader("Q13a", row));
  for (const row of BRA_TYPES) headers.push(wideHeader("Q13b", row));

  // Q14 spend periods
  for (const period of Q14_PERIODS) headers.push(wideHeader("Q14", period));

  // Q15a / Q15b
  for (const opt of Q15A_OPTIONS) headers.push(wideHeader("Q15a", opt.label));
  for (const opt of Q15B_OPTIONS) headers.push(wideHeader("Q15b", opt.label));

  // Q16 / Q17 statement matrices
  for (const stmt of Q16_STATEMENTS) headers.push(wideHeader("Q16", stmt));
  for (const stmt of Q16_STATEMENTS) headers.push(wideHeader("Q17", stmt));

  // Q18 / Q19 / Q20 grouped challenges
  const challenges = flattenChallengeItems();
  for (const item of challenges) headers.push(wideHeader("Q18", item));
  headers.push(wideHeader("Q18", "Other (please specify)"));
  for (const item of challenges) headers.push(wideHeader("Q19", item));
  for (const item of challenges) headers.push(wideHeader("Q20", item));
  headers.push(wideHeader("Q20", "Other (please specify)"));

  // Q21 brands (no Enamor in sample list)
  for (const brand of BRANDS) {
    if (brand === "Enamor") continue;
    headers.push(wideHeader("Q21", brand));
  }
  for (let i = 1; i <= 3; i++) {
    headers.push(wideHeader("Q21", `Other brand ${i} (typed in Q2)`));
  }

  // Q22 WTP features
  for (const feat of Q22_FEATURES) headers.push(wideHeader("Q22", feat));

  // Q23 open text
  headers.push(wideHeader("Q23"));

  // Q24 / Q25 info sources
  const sources = flattenInfoSourceItems();
  for (const src of sources) headers.push(wideHeader("Q24", src));
  headers.push(wideHeader("Q24", "I don't usually look for information before buying"));
  headers.push(wideHeader("Q24", "Other (please specify)"));
  for (const src of sources) headers.push(wideHeader("Q25", src));

  // Q26 / Q27 open text
  headers.push(wideHeader("Q26"));
  headers.push(wideHeader("Q27"));

  // Q28 size subfields
  headers.push(wideHeader("Q28", "Band size"));
  headers.push(wideHeader("Q28", "Cup size"));
  headers.push(wideHeader("Q28", "Full size"));

  return headers;
}
