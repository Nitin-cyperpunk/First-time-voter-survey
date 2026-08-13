type TerminationLike = {
  ruleKey: string;
  ruleLabel?: string | null;
  reasonText?: string | null;
};

export type ScreenerCompletionStatus = "Completed" | "Terminated";

export function isRegistrationTerminated(input: {
  terminated?: boolean;
  terminations?: TerminationLike[];
}): boolean {
  return Boolean(input.terminated) || (input.terminations?.length ?? 0) > 0;
}

export function formatRegistrationTerminationLabel(
  termination: TerminationLike,
): string {
  return (
    termination.reasonText?.trim() ||
    termination.ruleLabel?.trim() ||
    termination.ruleKey
  );
}

export function resolveScreenerCompletionTracking(input: {
  terminated?: boolean;
  terminations?: TerminationLike[];
}): {
  completionStatus: ScreenerCompletionStatus;
  terminationReason: string | null;
} {
  if (!isRegistrationTerminated(input)) {
    return { completionStatus: "Completed", terminationReason: null };
  }

  const labels = (input.terminations ?? [])
    .map(formatRegistrationTerminationLabel)
    .filter(Boolean);
  return {
    completionStatus: "Terminated",
    terminationReason: labels.length
      ? labels.join("|")
      : "terminated",
  };
}

export function buildRegistrationTerminationNotes(
  terminations: TerminationLike[] | undefined,
): string {
  if (!terminations?.length) {
    return "terminated";
  }

  return terminations.map(formatRegistrationTerminationLabel).join("|");
}
