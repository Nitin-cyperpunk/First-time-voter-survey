import { formatExportDateTime } from "@/lib/format-admin-datetime";
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

/** Shared IST export clock — delegates to formatExportDateTime. */
export function formatExportDate(
  value: string | Date | null | undefined,
): string {
  return formatExportDateTime(value);
}
