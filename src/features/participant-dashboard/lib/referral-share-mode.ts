import { isTerminatedStatus } from "@/lib/participant-lifecycle";

export type ReferralShareMode =
  | "instagram_only"
  | "whatsapp_only"
  | "both"
  | "none";

/** Both qualified completions and terminations can refer friends. */
export function resolveReferralShareMode(status: string): ReferralShareMode {
  if (!status) return "none";
  return "both";
}

export function isTerminatedShareStatus(status: string): boolean {
  return isTerminatedStatus(status);
}
