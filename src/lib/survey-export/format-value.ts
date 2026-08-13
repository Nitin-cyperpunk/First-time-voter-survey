import type { SurveyAnswerValue, SurveyLeafValue } from "@/lib/survey-response-document";

export function formatExportScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return String(value).trim();
}

export function formatMultiSelectValue(value: SurveyAnswerValue | undefined): string {
  return formatArrayMultiline(value);
}

export function formatArrayCommaSeparated(
  value: SurveyAnswerValue | undefined,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }
    if (typeof value[0] === "object" && value[0] !== null) {
      return "";
    }
    return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return "";
  }

  const raw = String(value).trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join(", ");
      }
    } catch {
      // Fall through to comma split.
    }
  }

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function formatArrayMultiline(
  value: SurveyAnswerValue | undefined,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }
    if (typeof value[0] === "object" && value[0] !== null) {
      return "";
    }
    return value.map((item) => String(item).trim()).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    return "";
  }

  const raw = String(value).trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join("\n");
      }
    } catch {
      // Fall through to comma-split legacy strings.
    }
  }

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export function isRepeatAnswer(
  value: SurveyAnswerValue | unknown,
): value is Array<Record<string, SurveyLeafValue>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    !Array.isArray(value[0])
  );
}

export function isMatrixObject(
  value: SurveyAnswerValue | unknown,
): value is Record<string, SurveyLeafValue> {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

/**
 * Format timestamps for Everyday Bra client export.
 * Matches Enamor_SAMPLE_filled_responses: `28/7/2026, 10:04:12 am`
 * (IST / Asia/Kolkata, d/m/yyyy, 12-hour clock, lowercase am/pm).
 */
export function formatExportDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const dayPeriod = get("dayPeriod").toLowerCase().replace(/\./g, "");

  return `${day}/${month}/${year}, ${hour}:${minute}:${second} ${dayPeriod}`;
}
