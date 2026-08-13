import type { SurveyAnswerValue } from "@/lib/survey-response-document";
import { isQuestionStorageKey } from "@/lib/survey-response-document";

const INTERNAL_ANSWER_KEYS = new Set([
  "_st",
  "_screen_times",
  "_last_screen",
  "_termreason",
  "_endreason",
]);

export function canonicalQKey(key: string): string {
  const match = key.match(/^q(\d+)$/i);
  return match ? `q${match[1]}` : key.toLowerCase();
}

export function compareQKeys(left: string, right: string): number {
  const leftNum = Number.parseInt(left.replace(/\D/g, ""), 10);
  const rightNum = Number.parseInt(right.replace(/\D/g, ""), 10);
  if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
    return leftNum - rightNum;
  }
  return left.localeCompare(right);
}

export function isInternalAnswerKey(key: string): boolean {
  return INTERNAL_ANSWER_KEYS.has(key.toLowerCase());
}

export function findAnswerForQKey(
  answers: Record<string, SurveyAnswerValue> | Record<string, unknown>,
  qKey: string,
  label?: string,
): SurveyAnswerValue | undefined {
  const canonical = canonicalQKey(qKey);
  for (const [key, value] of Object.entries(answers)) {
    if (isInternalAnswerKey(key)) continue;
    if (canonicalQKey(key) === canonical) {
      return value as SurveyAnswerValue;
    }
    if (label && key === `Q${canonical.replace(/\D/g, "")}. ${label}`) {
      return value as SurveyAnswerValue;
    }
    if (label && /^Q\d+\.\s/.test(key) && canonicalQKey(key.split(".")[0] ?? key) === canonical) {
      return value as SurveyAnswerValue;
    }
  }
  return undefined;
}

export function collectOrphanQuestionKeys(
  answers: Record<string, SurveyAnswerValue> | Record<string, unknown>,
  knownQKeys: Set<string>,
): string[] {
  const orphans: string[] = [];
  for (const key of Object.keys(answers)) {
    if (!isQuestionStorageKey(key) || isInternalAnswerKey(key)) continue;
    const canonical = canonicalQKey(key);
    if (!knownQKeys.has(canonical)) {
      orphans.push(key);
    }
  }
  return orphans.sort(compareQKeys);
}
