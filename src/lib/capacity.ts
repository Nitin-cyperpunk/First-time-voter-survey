/**
 * Qualified-completion capacity.
 *
 * WHAT COUNTS: screener_responses.completion_status = 'Completed' only.
 * Terminated, partial, and NULL rows never consume a slot.
 *
 * Four-level enforcement inside insert_screener_response_with_capacity:
 * pg_advisory_xact_lock + city / cell / state / study counts + INSERT
 * in one transaction. Do not select-count then insert from the app.
 */

export type CapacityRejectCode =
  | "form_closed"
  | "city_full"
  | "cell_full"
  | "state_full"
  | "study_full"
  | "region_full"
  | "global_full"
  | "city_inactive"
  | "city_required";

export const CAPACITY_REJECT_MESSAGES: Record<CapacityRejectCode, string> = {
  form_closed:
    "This survey is no longer accepting responses. Please contact the admin if you believe this is an error.",
  city_full:
    "This city is no longer accepting responses. Please choose another city if one is available.",
  cell_full:
    "This area group is no longer accepting responses. Please choose another city if one is available.",
  state_full:
    "This state is no longer accepting responses. Please choose another city if one is available.",
  study_full:
    "This survey has reached its respondent capacity and is no longer accepting new completions.",
  region_full:
    "This city is no longer accepting responses. Please choose another city if one is available.",
  global_full:
    "This survey has reached its respondent capacity and is no longer accepting new completions.",
  city_inactive:
    "The city you selected is no longer available. Please choose another city.",
  city_required: "Please select a city from the list.",
};

export class CapacityError extends Error {
  readonly code: CapacityRejectCode;

  constructor(code: CapacityRejectCode, message?: string) {
    super(message ?? CAPACITY_REJECT_MESSAGES[code]);
    this.name = "CapacityError";
    this.code = code;
  }
}

export function isCapacityRejectCode(value: unknown): value is CapacityRejectCode {
  return (
    value === "form_closed" ||
    value === "city_full" ||
    value === "cell_full" ||
    value === "state_full" ||
    value === "study_full" ||
    value === "region_full" ||
    value === "global_full" ||
    value === "city_inactive" ||
    value === "city_required"
  );
}

const Q15_VALUES = new Set([
  "rural/village",
  "rural",
  "village",
  "small town",
  "large town",
  "city",
  "metro",
]);

/**
 * Pull Q15 self-reported area type from answers jsonb only.
 * Never use cities.area_type (urban|rural) here.
 */
export function extractSelfReportedAreaType(
  answers: Record<string, unknown> | null | undefined,
): string | null {
  if (!answers || typeof answers !== "object") return null;

  const candidateKeys = [
    "self_reported_area_type",
    "q15",
    "Q15",
    "area_type_self",
    "reported_area_type",
  ];

  for (const key of candidateKeys) {
    const raw = answers[key];
    const value = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
    const normalized = value.trim().toLowerCase();
    if (Q15_VALUES.has(normalized)) return value.trim();
  }

  for (const [key, raw] of Object.entries(answers)) {
    if (!/^q?15$/i.test(key) && !/area.?type/i.test(key)) continue;
    if (/residency/i.test(key)) continue;
    const value = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
    const normalized = value.trim().toLowerCase();
    if (Q15_VALUES.has(normalized)) return value.trim();
  }

  return null;
}
