import { isTerminatedStatus } from "@/lib/participant-lifecycle";

export type PendingRewardReasonInput = {
  rewardStatus: string;
  referredFound: boolean;
  referredStatus: string | null;
  terminationReason: string | null;
};

function humanizeTerminationReason(raw: string | null): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";

  return trimmed
    .split("|")
    .map((part) => {
      const token = part.trim();
      if (!token) return "";
      const withoutPrefix = token.startsWith("TERMINATE_")
        ? token.slice("TERMINATE_".length)
        : token;
      return withoutPrefix.replaceAll("_", " ").toLowerCase();
    })
    .filter(Boolean)
    .join("; ");
}

/**
 * Why a referral reward is still pending.
 * Derived at read time — referrals.reward_status is stored, but no reason column exists.
 * The only code path that leaves a row pending is a terminated registration
 * (createReferral always inserts pending; markReferralEarned runs only when
 * registration was not terminated).
 */
export function pendingRewardReason(
  input: PendingRewardReasonInput,
): string | null {
  if (input.rewardStatus.toLowerCase() !== "pending") return null;

  if (!input.referredFound) {
    return "Reason not recorded — referred participant is missing.";
  }

  if (isTerminatedStatus(input.referredStatus ?? "")) {
    const detail = humanizeTerminationReason(input.terminationReason);
    if (detail) {
      return `Referred participant was terminated (${detail}). Reward is earned only if they complete registration.`;
    }
    return "Referred participant was terminated. Reward is earned only if they complete registration.";
  }

  return "Reason not recorded.";
}
