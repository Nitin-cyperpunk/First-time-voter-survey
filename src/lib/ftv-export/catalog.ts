/** FTV-v1 export catalog. Labels match the HTML questionnaire. */

import { INDIA_STATES, INDIA_UTS } from "@/lib/india-states";

export const FTV_STATES = INDIA_STATES;
export const FTV_UTS = INDIA_UTS;

export const EM_DASH = " — ";

export const QTEXT = {
  Q1: "Were you eligible to vote for the first time in the 2024 Lok Sabha election?",
  Q2: "Did you vote in the 2024 Lok Sabha election?",
  Q3: "Which party / candidate of your constituency did you vote for?",
  Q4: "Before the election, how sure were you that you would vote for this party or candidate?",
  Q5: "When deciding who to vote for, which factors were more important to you?",
  Q6a: "Economic factors",
  Q6b: "Non-economic factors",
  Q7: "Select the three factors that had the greatest influence on your voting decision, and rank them in order of importance (1 = most important).",
  Q8: "Which sources did you rely on most for information about political parties, candidates, or election-related issues during the 2024 Lok Sabha election?",
  Q9: "Did you vote for the same political party or alliance preferred by most members of your family?",
  Q10: "Compared with two years before the election, how had your household’s financial situation changed by the time of the 2024 election?",
  Q11: "During the year before the election, how strongly did rising prices affect your household?",
  Q12: "At the time of the election, how confident were you about obtaining suitable employment or career opportunities?",
  Q13: "At the time of the voting, how would you have rated the condition of India’s economy?",
  Q14: "At the time of the election, how effectively did you believe the national government had handled the following?",
  Q15_1: "State or union territory in which you were registered to vote",
  Q15_2: "Type of area in which you primarily lived at the time of the election",
  Q15_3: "Highest level of education at the time of the voting",
  Q16: "Which range best describes your household’s approximate annual income?",
  Q17: "In one or two sentences, what most shaped your voting decision in the 2024 Lok Sabha election?",
} as const;

export const Q6A_ITEMS = [
  "Jobs and employment opportunities",
  "Rising cost and cost of living",
  "Your family's financial situation",
  "India’s overall economic performance",
  "Government welfare schemes",
  "Financial assistance",
  "Access to affordable education",
  "Skill development",
  "Perception of economic inequality",
] as const;

export const Q6B_ITEMS = [
  "Integrity of the local candidate",
  "Past performance of the local candidate",
  "Leadership qualities of national political leaders",
  "Corruption and government accountability",
  "National security",
  "Religion issues",
  "Communal issues",
  "Women’s safety",
  "Family or community considerations",
  "Political information gathered through social media",
] as const;

export const Q7_OPTIONS = [
  "Jobs and employment opportunities",
  "Inflation and cost of living",
  "Household financial circumstances",
  "Future income and career prospects",
  "India’s overall economic performance",
  "Welfare schemes and financial assistance",
  "Education and skill development",
  "Poverty and inequality",
  "Local candidate quality",
  "National political leadership",
  "Corruption and accountability",
  "National security",
  "Religion or communal issues",
  "Caste or community",
  "Women’s safety",
  "Family or community preferences",
  "Other (please specify)",
] as const;

export const Q8_OPTIONS = [
  "Friends or peers of a similar age",
  "Parents or older family members",
  "Other family members",
  "Instagram",
  "YouTube",
  "X (Twitter)",
  "Facebook",
  "WhatsApp",
  "Other social media platforms",
  "Local newspapers or local news websites",
  "National newspapers or national news websites",
  "Television news",
  "Radio",
  "Podcasts",
  "Political parties’ or candidates’ official social media accounts or websites",
  "Political rallies, speeches, or campaign materials",
  "Teachers, professors, or educational institutions",
  "Other (please specify)",
  "I did not actively seek political information",
] as const;

export const Q14_ITEMS = [
  "Job creation",
  "Inflation and cost of living",
  "Economic growth",
  "Poverty reduction",
  "Education and skill development",
  "Welfare provision",
] as const;

export const SCALE_Q6: Record<number, string> = {
  1: "Not at all",
  2: "A little",
  3: "Somewhat",
  4: "A lot",
  5: "A great deal / very critical",
};

export const SCALE_Q14: Record<number, string> = {
  1: "Very ineffectively",
  2: "Somewhat ineffectively",
  3: "Neither effectively nor ineffectively",
  4: "Somewhat effectively",
  5: "Very effectively",
};

export const SINGLE_OPTIONS: Record<string, readonly string[]> = {
  Q1: ["Yes", "No"],
  Q2: ["Yes", "No"],
  Q3: [
    "A party or candidate belonging to the governing national alliance",
    "A party or candidate belonging to the main opposition alliance",
    "A regional or other party",
    "An independent candidate",
    "NOTA",
    "Prefer not to say",
  ],
  Q4: ["Very sure", "Somewhat sure", "Not very sure", "Not sure at all"],
  Q5: [
    "Economic factors were much more important",
    "Economic factors were somewhat more important",
    "Economic and other factors were equally important",
    "Other factors were somewhat more important",
    "Other factors were much more important",
  ],
  Q9: [
    "Yes",
    "No",
    "My family did not have a clear shared preference",
    "I do not know their preferences",
  ],
  Q10: [
    "Improved significantly",
    "Improved somewhat",
    "Stayed approximately the same",
    "Worsened somewhat",
    "Worsened significantly",
    "Unsure",
  ],
  Q11: [
    "Not at all",
    "Slightly",
    "Moderately",
    "Significantly",
    "Very significantly",
    "Unsure",
  ],
  Q12: [
    "Very confident",
    "Somewhat confident",
    "Neither confident nor unconfident",
    "Somewhat unconfident",
    "Very unconfident",
    "Not applicable",
  ],
  Q13: ["Very good", "Good", "Neither good nor poor", "Poor", "Very poor"],
  Q15_2: [
    "Rural area or village",
    "Small town",
    "Large town",
    "City",
    "Major metropolitan city",
  ],
  Q15_3: [
    "Secondary school or below",
    "Higher secondary school",
    "Undergraduate education in progress",
    "Undergraduate degree completed",
    "Postgraduate education in progress or completed",
    "Vocational or technical education",
    "Other",
  ],
  Q16: [
    "Less than ₹3 lakh",
    "₹3 lakh–₹6 lakh",
    "₹6 lakh–₹10 lakh",
    "₹10 lakh–₹20 lakh",
    "₹20 lakh–₹50 lakh",
    "More than ₹50 lakh",
    "I do not know",
    "Prefer not to say",
  ],
};

export function itemHeader(qid: string, label: string): string {
  return `${qid}${EM_DASH}${label}`;
}

export const Q6A_HEADERS = Q6A_ITEMS.map((label, index) =>
  itemHeader(`Q6a_${index + 1}`, label),
);
export const Q6B_HEADERS = Q6B_ITEMS.map((label, index) =>
  itemHeader(`Q6b_${index + 1}`, label),
);
export const Q14_HEADERS = Q14_ITEMS.map((label, index) =>
  itemHeader(`Q14_${index + 1}`, label),
);
export const Q8_HEADERS = Q8_OPTIONS.map((label, index) =>
  itemHeader(`Q8_${index + 1}`, label),
);

export const FTV_METADATA_HEADERS = [
  "respondent_id",
  "survey_version",
  "status",
  "started_at",
  "completed_at",
  "terminated_at",
  "duration_seconds",
  "consent",
  "terms_accepted",
  "randomisation_seed",
  "order_q6_blocks",
  "order_q6a",
  "order_q6b",
  "order_q14",
  "state_match",
  "created_at",
] as const;

export const FTV_PROFILE_HEADERS = [
  "name",
  "email",
  "phone",
  "area",
  "city",
  "city_id",
  "city_area_type",
  "city_state",
  "quota_cell",
  "state_code",
  "state",
  "zip",
  "age_band",
  "dob",
  "age_today",
  "age_at_poll",
  "age_at_qualifying_date",
  "gender_code",
  "gender",
  "relationship_code",
  "relationship_status",
] as const;

export const FTV_ANSWER_HEADERS = [
  "Q1_code",
  "Q1",
  "Q2_code",
  "Q2",
  "Q3_code",
  "Q3",
  "Q4_code",
  "Q4",
  "Q5_code",
  "Q5",
  ...Q6A_HEADERS,
  ...Q6B_HEADERS,
  "Q7_rank1_code",
  "Q7_rank1",
  "Q7_rank1_other",
  "Q7_rank2_code",
  "Q7_rank2",
  "Q7_rank2_other",
  "Q7_rank3_code",
  "Q7_rank3",
  "Q7_rank3_other",
  ...Q8_HEADERS,
  "Q8_other",
  "Q8_selection_order",
  "Q8_count",
  "Q9_code",
  "Q9",
  "Q10_code",
  "Q10",
  "Q11_code",
  "Q11",
  "Q12_code",
  "Q12",
  "Q13_code",
  "Q13",
  ...Q14_HEADERS,
  "Q15_1_code",
  "Q15_1",
  "Q15_2_code",
  "Q15_2",
  "Q15_3_code",
  "Q15_3",
  "Q15_3_other",
  "Q16_code",
  "Q16",
  "Q17",
  "Q17_original",
  "Q17_script",
  "Q17_spoken_language",
] as const;

export const FTV_EXPORT_HEADERS: string[] = [
  ...FTV_METADATA_HEADERS,
  ...FTV_PROFILE_HEADERS,
  ...FTV_ANSWER_HEADERS,
];

export type FtvCodebookRow = {
  qid: string;
  question: string;
  type: string;
  code: string | number;
  label: string;
};

export function buildFtvCodebook(): FtvCodebookRow[] {
  const rows: FtvCodebookRow[] = [];

  for (const [qid, options] of Object.entries(SINGLE_OPTIONS)) {
    const question =
      qid === "Q15_2" || qid === "Q15_3"
        ? QTEXT[qid]
        : (QTEXT[qid as keyof typeof QTEXT] ?? qid);
    for (let i = 0; i < options.length; i += 1) {
      rows.push({
        qid,
        question,
        type: "single",
        code: i + 1,
        label: options[i]!,
      });
    }
  }

  [...FTV_STATES, ...FTV_UTS].forEach((label, index) => {
    rows.push({
      qid: "Q15_1",
      question: QTEXT.Q15_1,
      type: "single",
      code: index + 1,
      label,
    });
  });

  Q6A_ITEMS.forEach((label, index) => {
    const qid = `Q6a_${index + 1}`;
    for (const [code, scaleLabel] of Object.entries(SCALE_Q6)) {
      rows.push({
        qid,
        question: `${QTEXT.Q6a} – ${label}`,
        type: "grid",
        code: Number(code),
        label: `${label} | ${scaleLabel}`,
      });
    }
  });

  Q6B_ITEMS.forEach((label, index) => {
    const qid = `Q6b_${index + 1}`;
    for (const [code, scaleLabel] of Object.entries(SCALE_Q6)) {
      rows.push({
        qid,
        question: `${QTEXT.Q6b} – ${label}`,
        type: "grid",
        code: Number(code),
        label: `${label} | ${scaleLabel}`,
      });
    }
  });

  Q7_OPTIONS.forEach((label, index) => {
    rows.push({
      qid: "Q7",
      question: QTEXT.Q7,
      type: "rank",
      code: index + 1,
      label,
    });
  });

  Q8_OPTIONS.forEach((label, index) => {
    rows.push({
      qid: `Q8_${index + 1}`,
      question: QTEXT.Q8,
      type: "multi",
      code: index + 1,
      label,
    });
  });

  Q14_ITEMS.forEach((label, index) => {
    const qid = `Q14_${index + 1}`;
    for (const [code, scaleLabel] of Object.entries(SCALE_Q14)) {
      rows.push({
        qid,
        question: `${QTEXT.Q14} – ${label}`,
        type: "grid",
        code: Number(code),
        label: `${label} | ${scaleLabel}`,
      });
    }
  });

  rows.push({
    qid: "Q17",
    question: QTEXT.Q17,
    type: "open",
    code: "",
    label: "",
  });

  return rows;
}
