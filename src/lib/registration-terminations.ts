type TerminationLike = {
  ruleKey: string;
  ruleLabel?: string | null;
  questionKey?: string | null;
  questionLabel?: string | null;
  answerValue?: string | null;
  reasonText?: string | null;
};

export type ScreenerCompletionStatus = "Completed" | "Terminated";

export type RegistrationTerminationInput = {
  terminated?: boolean;
  terminations?: TerminationLike[];
  answerJson?: Record<string, unknown> | null;
};

function payloadTerminationStatus(
  answerJson?: Record<string, unknown> | null,
): string | null {
  const status = answerJson?.status;
  if (typeof status !== "string") return null;
  const trimmed = status.trim();
  return trimmed.startsWith("TERMINATE_") ? trimmed : null;
}

export function resolveRegistrationTerminationState(
  input: RegistrationTerminationInput,
): {
  terminated: boolean;
  terminations: TerminationLike[];
} {
  const terminations = [...(input.terminations ?? [])];
  let terminated = Boolean(input.terminated) || terminations.length > 0;

  const payloadStatus = payloadTerminationStatus(input.answerJson);
  if (payloadStatus) {
    terminated = true;
    if (!terminations.some((item) => item.ruleKey === payloadStatus)) {
      terminations.push({
        ruleKey: payloadStatus,
        ruleLabel: payloadStatus,
        reasonText: payloadStatus,
      });
    }
  }

  return { terminated, terminations };
}

export function isRegistrationTerminated(
  input: RegistrationTerminationInput,
): boolean {
  return resolveRegistrationTerminationState(input).terminated;
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

export function resolveScreenerCompletionTracking(
  input: RegistrationTerminationInput,
): {
  completionStatus: ScreenerCompletionStatus;
  terminationReason: string | null;
} {
  const { terminated, terminations } = resolveRegistrationTerminationState(input);
  if (!terminated) {
    return { completionStatus: "Completed", terminationReason: null };
  }

  const labels = terminations
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
