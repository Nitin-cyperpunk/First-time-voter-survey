import type { CallDispositionOption } from "@/lib/call-dispositions/types";

export const DEFAULT_CALL_DISPOSITIONS: CallDispositionOption[] = [
  { key: "verified", label: "Verified", enabled: true },
  { key: "not_eligible", label: "Not Eligible", enabled: true },
  { key: "not_interested", label: "Not Interested", enabled: true },
  { key: "wrong_person", label: "Wrong Person", enabled: true },
  { key: "fake_not_a_woman", label: "Fake / Not a Woman", enabled: true },
  { key: "call_later", label: "Call Later", enabled: true },
  { key: "language_barrier", label: "Language Barrier", enabled: true },
  { key: "not_reachable", label: "Not Reachable", enabled: true },
  { key: "wrong_number", label: "Wrong Number", enabled: true },
];

export const DISPOSITION_KEY_VERIFIED = "verified";
export const DISPOSITION_KEY_NOT_ELIGIBLE = "not_eligible";

/** Outcomes that contradict an already-verified participant. Kept visible but disabled in UI. */
export const DISPOSITIONS_CONTRADICTING_VERIFIED = [
  "not_eligible",
  "not_interested",
  "wrong_person",
  "fake_not_a_woman",
  "wrong_number",
] as const;

export type DispositionContradictingVerified =
  (typeof DISPOSITIONS_CONTRADICTING_VERIFIED)[number];

export function dispositionContradictsVerified(dispositionKey: string): boolean {
  return (DISPOSITIONS_CONTRADICTING_VERIFIED as readonly string[]).includes(
    dispositionKey,
  );
}
