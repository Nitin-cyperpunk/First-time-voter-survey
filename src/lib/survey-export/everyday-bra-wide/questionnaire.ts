/**
 * Everyday Bra main survey questionnaire definition for the client wide export.
 * Question numbers / texts / option labels match Enamor_SAMPLE_filled_responses.csv.
 */

export const EM_DASH = "—";

export const BRANDS = [
  "Jockey",
  "Enamor",
  "Zivame",
  "Triumph",
  "Amante",
  "Clovia",
  "Marks & Spencer",
  "Van Heusen",
  "Lovable",
  "Shyaway",
  "Lyra",
  "Nykd by Nykaa",
  "Blissclub",
  "Underneat",
  "Trylo",
  "Amour Secret",
  "Daisy Dee",
  "Soie",
  "Westside (Wunderlove)",
  "H&M",
  "Zudio",
] as const;

export const BRA_TYPES = [
  "T-shirt bra",
  "Push-up",
  "Non-wired bra",
  "Sports bra",
  "Bralette (lacey)",
  "Minimiser / Full-coverage",
  "Strapless",
  "Camisole (built-in bra top)",
  "Seamless",
  "Padded",
  "Plunge / Deep-neck",
  "Beginners / Teen bra",
  "Adhesive / stick-on",
  "Wired bra",
  "Maternity",
  "Balconette",
  "Front button",
  "Transparent back",
  "Lightly padded",
  "Non-padded",
] as const;

export const Q8_CHANGE_LABELS: Record<string, string> = {
  "1": "Buy more now",
  "2": "Same",
  "3": "Buy less",
  "4": "Don't buy anymore",
  "5": "Never bought",
};

export const PURCHASE_CHANNELS = [
  "Exclusive brand store",
  "Multi-brand outlet",
  "E-commerce",
  "Local retail store",
  "Large-format store",
  "Quick commerce",
  "Brand website",
] as const;

export const Q14_PERIODS = [
  "1–2 years ago",
  "Currently",
  "Expected next 1–2 years",
] as const;

export const Q15A_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Income up", label: "My income has gone up" },
  {
    value: "Prefer premium",
    label: "I now prefer better quality or premium bras",
  },
  {
    value: "Switched expensive",
    label: "I switched to a more expensive brand",
  },
  {
    value: "Specialised",
    label:
      "I have started buying more specialised bras (sports, seamless, wired, etc.)",
  },
  {
    value: "Comfort/fit",
    label: "Comfort and fit have become more important to me",
  },
  {
    value: "Different occasions",
    label: "I need different bras for different occasions or outfits",
  },
  {
    value: "Last longer",
    label: "I now choose bras that last longer, even if they cost more",
  },
  {
    value: "Body changed",
    label: "My body size or fit requirements have changed",
  },
  {
    value: "Lifestyle changed",
    label: "My lifestyle has changed (work, fitness, marriage, pregnancy)",
  },
  { value: "Prices increased", label: "Bra prices have increased" },
  {
    value: "Support/coverage",
    label: "I wanted better support or coverage",
  },
  { value: "Other", label: "Other (please specify)" },
];

export const Q15B_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Saving", label: "I am trying to save money" },
  {
    value: "Expenses up",
    label: "My household expenses have increased",
  },
  {
    value: "Buy on sale",
    label: "I now buy during sales, offers or discounts",
  },
  {
    value: "Lower priced ok",
    label: "Lower-priced bras meet my needs just as well",
  },
  {
    value: "Cheaper similar",
    label: "Found another brand with similar quality for a lower price",
  },
  {
    value: "No value premium",
    label: "I no longer see enough value in paying more for premium bras",
  },
  {
    value: "Premium not worth",
    label: "I tried premium bras but did not find them worth the extra cost",
  },
  {
    value: "Prefer value",
    label: "I now prefer value-for-money over premium brands",
  },
  {
    value: "Better cheaper options",
    label: "There are better-quality options available at lower prices",
  },
  {
    value: "Lifestyle changed",
    label:
      "My lifestyle has changed, so I no longer need premium/specialised bras",
  },
  {
    value: "Prefer basic",
    label: "I now prefer simpler/basic bras over premium or specialised bras",
  },
  {
    value: "Compare online",
    label: "I can easily compare prices online and find better deals",
  },
  {
    value: "Same comfort cheaper",
    label:
      "I realised I could get similar comfort and fit without spending more",
  },
  { value: "Other", label: "Other (please specify)" },
];

export const Q16_STATEMENTS = [
  "Comfortable to wear all day",
  "Soft against the skin",
  "Stays comfortable even in hot and humid weather",
  "Fits true to my size",
  "Easy to find my correct size",
  "Gives a consistent fit across different styles",
  "Prevents cup gaps",
  "Prevents breast spillage",
  "Provides good support throughout the day",
  "Gives good coverage",
  "Gives a natural lift and shape",
  "Retains its shape after repeated washing",
  "Lasts longer than other brands",
  "Offers a wide range of bra styles",
  "Offers a wide range of sizes",
  "Introduces innovative products and fabrics",
  "My size is usually available when I shop",
  "Easy to find in stores or online",
  "Made with high-quality fabrics",
  "Offers good value for money",
  "Worth paying more for",
  "A brand I trust to buy without trying on",
] as const;

export const CHALLENGE_GROUPS: Array<{ group: string; items: string[] }> = [
  {
    group: "Fit & Comfort",
    items: [
      "Difficult to find the right fit",
      "Difficult to find the correct size",
      "My size is often unavailable",
      "Cup gaps",
      "Breast spillage",
      "Poor support",
      "Bra becomes uncomfortable after long hours",
      "Straps dig in or slip",
      "Band feels too tight or uncomfortable",
      "Underwire pokes or feels uncomfortable",
    ],
  },
  {
    group: "Quality & Durability",
    items: [
      "Fabric doesn't feel comfortable on my skin",
      "Bra loses its shape after washing",
      "Elastic loosens over time",
      "Doesn't last as long as I expect",
    ],
  },
  {
    group: "Range & Choice",
    items: [
      "Limited styles that suit my needs",
      "Limited colours or designs",
    ],
  },
  {
    group: "Value",
    items: [
      "Too expensive for what it offers",
      "Difficult to find good quality at a reasonable price",
    ],
  },
  {
    group: "Availability",
    items: [
      "Difficult to find the brand or style I want in stores or online",
    ],
  },
  {
    group: "Brand Choice",
    items: [
      "Another brand offered a better fit",
      "Another brand offered better comfort",
      "Another brand offered better quality",
      "Another brand offered better value for money",
      "Another brand had styles better suited to my needs",
    ],
  },
];

export const Q22_FEATURES = [
  "A bra that gives the right fit",
  "Cups that fit perfectly without gaps",
  "A bra that prevents breast spillage",
  "Better support throughout the day",
  "A comfortable band that fits securely without feeling tight",
  "Comfortable straps that stay in place",
  "Comfortable underwire that doesn't poke or irritate",
  "All-day comfort, even after long hours of wear",
  "Soft, skin-friendly fabric",
  "A bra that retains its shape after repeated washing",
  "Long-lasting elastic that stays firm over time",
  "A bra that lasts longer without losing quality",
  "A wider choice of styles for different needs and occasions",
  "A wider range of colours and designs",
  "Better guidance to help me choose the right bra",
  "Better size guidance and fitting assistance",
  "Easier ways to compare and choose the right bra",
  "Better quality that's worth paying more for",
  "High-quality bras at a reasonable price",
  "Easy availability in stores and online",
  "A brand where my size is always available",
] as const;

export const INFO_SOURCES: Array<{ group: string; items: string[] }> = [
  {
    group: "Online",
    items: [
      "Brand website/app",
      "Online marketplaces (Myntra, Ajio, Amazon, Flipkart)",
      "Google Search",
      "AI tools (ChatGPT, Gemini, Meta AI)",
      "Instagram/Facebook",
      "YouTube",
      "Online forums/communities",
      "Short videos/Reels",
    ],
  },
  {
    group: "Offline",
    items: [
      "In-store browsing",
      "Friends / Colleagues",
      "Mother",
      "Sister/Cousin",
      "Partner",
      "Salesperson/store staff",
    ],
  },
];

/** Client-facing question texts (match sample CSV exactly). */
export const QUESTION_TEXT: Record<string, string> = {
  Q1: "Which bra brands can you think of right now? Just type the names that come to mind.",
  Q2: "Here are some brand names. Please select the ones you have heard of.",
  Q3: "Which of these brands have you ever purchased?",
  Q4: "Which of these have you purchased in the last 2 years?",
  Q4b: "Which of these have you purchased in the last 1 year?",
  Q5: "Which of these have you purchased in the last 6 months?",
  Q6: "Which of these did you purchase during your last purchase?",
  Q7: "Which of these would you consider purchasing in the future?",
  Q8: "Thinking about 2 years ago, how has your purchase of each bra type changed today?",
  Q8a: "How many of each of these bra types do you own?",
  Q8b: "Compared to 2 years ago, in this bra type have you changed the brands that you use?",
  Q9: "Of these bra types, how many do you actually wear regularly?",
  Q10: "What brand is each of these bras?",
  Q11: "Approximately how much did you pay for each of these bras?",
  Q12: "Where did you buy each of these bras?",
  Q13a: "How often do you wear each of these bras?",
  Q13b: "When did you buy each of these bras?",
  Q14: "Approximately how much did/do you pay for ONE everyday bra during each period?",
  Q15a: "Why do you now spend more on your everyday bras than you did 1 year ago?",
  Q15b: "Why do you now spend less on your everyday bras than you did 1 year ago?",
  Q16: "When choosing an everyday bra, how important is each of the following?",
  Q17: "Which brand comes to your mind for each statement below?",
  Q18: "What challenges or frustrations do you face when buying or wearing everyday bras?",
  Q19: "Which are the TOP 5 challenges you would most like your everyday bra brand to solve?",
  Q20: "What were the main reasons you stopped buying Enamor?",
  Q21: "Which brand did you move to from Enamor?",
  Q22: "For which features would you pay MORE than you do for your current bra?",
  Q23: "If you could have ANY bra brand in your wardrobe — budget no object — which brand would you most love to own or wear more of?",
  Q24: "When you want information or advice before buying a bra, which of the following do you use?",
  Q25: "Which of these would have the greatest influence on someone planning to buy a bra?",
  Q26: "What do you usually search for when looking for information about bras online?",
  Q27: "Are there any influencers, creators or online pages whose recommendations on bras or innerwear you trust?",
  Q28: "Your usual bra size",
};

export const META_HEADERS = [
  "Respondent ID",
  "Status (complete / partial / consent_declined)",
  "Survey version",
  "Started at",
  "Completed at",
  "Duration (minutes)",
  "Last screen reached",
  "Q16/Q17 tab order shown",
  "Q22 tab order shown",
] as const;

export const CONSENT_HEADER =
  "Consent. Do you consent to participate in this exercise?";

export function wideHeader(
  qKey: string,
  ...parts: string[]
): string {
  const text = QUESTION_TEXT[qKey];
  if (!text) throw new Error(`Unknown question key: ${qKey}`);
  if (parts.length === 0) return `${qKey}. ${text}`;
  return `${qKey}. ${text} ${EM_DASH} ${parts.join(` ${EM_DASH} `)}`;
}

export function flattenChallengeItems(): string[] {
  const out: string[] = [];
  for (const group of CHALLENGE_GROUPS) {
    for (const item of group.items) {
      out.push(`${group.group} ${EM_DASH} ${item}`);
    }
  }
  return out;
}

export function flattenInfoSourceItems(): string[] {
  const out: string[] = [];
  for (const group of INFO_SOURCES) {
    for (const item of group.items) {
      out.push(`${group.group} ${EM_DASH} ${item}`);
    }
  }
  return out;
}
