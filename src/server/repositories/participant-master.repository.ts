import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { getRewardAmounts } from "@/lib/study-config/rewards";
import {
  isQualifiedCompletionStatus,
  isTerminatedStatus,
} from "@/lib/participant-lifecycle";
import type { ScreenerSchema } from "@/types/domain";
import { mapParticipant } from "@/server/repositories/participants.repository";
import { listRegistrationTerminationsByLeadId } from "@/server/repositories/form-terminations.repository";
import type { FormTerminationRow } from "@/server/repositories/form-terminations.repository";

export type StatusHistoryEntry = {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string;
  changedAt: Date;
  notes: string | null;
};

export type ParticipantMasterRecord = {
  participant: {
    leadId: string;
    referralCode: string;
    fullName: string;
    mobile: string;
    dob: string;
    city: string | null;
    status: string;
    referredBy: string | null;
    upiId: string | null;
    deviceFingerprint: string | null;
    duplicateFlag: boolean;
    duplicateReason: string | null;
    duplicateDetectedAt: Date | null;
    reviewStatus: string;
    originalParticipantLeadId: string | null;
    duplicateClusterId: string | null;
    isFingerprintClusterOriginal: boolean;
    duplicateGamingPattern: string | null;
    createdAt: Date;
  };
  referral: {
    referralCode: string;
    referredBy: string | null;
    totalReferrals: number;
    referralStatus: string | null;
    rewardStatus: string | null;
    referralEarnings: number;
  };
  screener: {
    formVersion: number;
    answers: Record<string, Json>;
    responseTimes: Record<string, number> | null;
    startedAt: Date | null;
    submittedAt: Date;
    totalDurationSec: number | null;
    questionSchema: ScreenerSchema | null;
    eligibilityDecision: string;
  } | null;
  statusHistory: StatusHistoryEntry[];
  registrationTerminations: FormTerminationRow[];
};

export async function getParticipantMasterRecord(
  leadId: string,
): Promise<ParticipantMasterRecord | null> {
  const supabase = getSupabaseAdmin();

  const [
    { data: participantRow, error: participantError },
    { data: screenerRow },
    { data: statusRows },
    { count: totalReferrals },
    { data: incomingReferral },
    { count: earnedReferrals },
  ] = await Promise.all([
    supabase.from("participants").select("*").eq("lead_id", leadId).maybeSingle(),
    supabase
      .from("screener_responses")
      .select("*")
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("status_history")
      .select("*")
      .eq("lead_id", leadId)
      .order("changed_at", { ascending: false }),
    supabase
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_lead_id", leadId),
    supabase
      .from("referrals")
      .select("reward_status")
      .eq("referred_lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_lead_id", leadId)
      .in("reward_status", ["earned", "paid"]),
  ]);

  if (participantError) throw participantError;
  if (!participantRow) return null;

  const participant = mapParticipant(participantRow);

  const statusHistory: StatusHistoryEntry[] = (statusRows ?? []).map((row) => ({
    id: row.id,
    oldStatus: row.old_status ?? null,
    newStatus: row.new_status ?? row.status,
    changedBy: row.changed_by ?? "system",
    changedAt: new Date(row.changed_at),
    notes: row.notes ?? null,
  }));

  const eligibilityDecision = deriveEligibilityDecision(
    participant.status,
    statusHistory,
  );

  const registrationTerminations =
    await listRegistrationTerminationsByLeadId(leadId);
  const { referralRewardAmount } = await getRewardAmounts();

  let questionSchema: ScreenerSchema | null = null;
  if (screenerRow?.form_version) {
    const { data: formVersionRow } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_type", "registration")
      .eq("version", screenerRow.form_version)
      .maybeSingle();
    questionSchema = (formVersionRow?.schema as ScreenerSchema | null) ?? null;
  }

  return {
    participant: {
      leadId: participant.leadId,
      referralCode: participant.referralCode,
      fullName: participant.fullName,
      mobile: participant.mobile,
      dob: participant.dob,
      city: participant.city,
      status: participant.status,
      referredBy: participant.referredBy,
      upiId: participantRow.upi_id ?? null,
      deviceFingerprint: participant.deviceFingerprint,
      duplicateFlag: participant.duplicateFlag,
      duplicateReason: participant.duplicateReason,
      duplicateDetectedAt: participant.duplicateDetectedAt,
      reviewStatus: participant.reviewStatus,
      originalParticipantLeadId: participant.originalParticipantLeadId,
      duplicateClusterId: participant.duplicateClusterId,
      isFingerprintClusterOriginal: participant.isFingerprintClusterOriginal,
      duplicateGamingPattern: participant.duplicateGamingPattern,
      createdAt: participant.createdAt,
    },
    referral: {
      referralCode: participant.referralCode,
      referredBy: participant.referredBy,
      totalReferrals: totalReferrals ?? 0,
      referralStatus: incomingReferral?.reward_status ?? null,
      rewardStatus: incomingReferral?.reward_status ?? null,
      referralEarnings: (earnedReferrals ?? 0) * referralRewardAmount,
    },
    screener: screenerRow
      ? {
          formVersion: screenerRow.form_version,
          answers: (screenerRow.answers ?? {}) as Record<string, Json>,
          responseTimes: parseResponseTimes(screenerRow.response_times),
          startedAt: screenerRow.started_at
            ? new Date(screenerRow.started_at)
            : null,
          submittedAt: new Date(screenerRow.submitted_at),
          totalDurationSec: screenerRow.total_duration_sec ?? null,
          questionSchema,
          eligibilityDecision,
        }
      : null,
    statusHistory,
    registrationTerminations,
  };
}

function parseResponseTimes(
  value: Json | null | undefined,
): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isInteger(raw)) {
      parsed[key] = raw;
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function deriveEligibilityDecision(
  currentStatus: string,
  history: StatusHistoryEntry[],
): string {
  if (isTerminatedStatus(currentStatus)) return "Terminated";
  if (isQualifiedCompletionStatus(currentStatus)) return "Qualified";

  const outcomeEvent = history.find((entry) => {
    const status = entry.newStatus.toLowerCase();
    return (
      status === "terminated" ||
      status === "not_eligible" ||
      status === "completed" ||
      status === "eligible"
    );
  });

  if (outcomeEvent) {
    const status = outcomeEvent.newStatus.toLowerCase();
    return status === "terminated" || status === "not_eligible"
      ? "Terminated"
      : "Qualified";
  }

  return "Pending review";
}
