import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Participant } from "@/types/domain";
import { mapParticipant } from "@/server/repositories/participants.repository";

export type AdminParticipantRow = Participant & {
  hasScreener: boolean;
  screenerCompletionStatus: string | null;
  screenerTerminationReason: string | null;
};

export type AdminReferralRow = {
  id: string;
  referrerName: string;
  referrerMobile: string;
  referredName: string;
  referredMobile: string;
  rewardStatus: string;
  earnedAt: Date | null;
  createdAt: Date;
};

export async function listParticipants(limit = 200) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const participants = (data ?? []).map(mapParticipant);
  const leadIds = participants.map((p) => p.leadId);

  const { data: screeners, error: screenerError } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("lead_id, completion_status, termination_reason")
    .in("lead_id", leadIds.length ? leadIds : ["__none__"]);

  if (screenerError) throw screenerError;

  const screenerByLeadId = new Map(
    (screeners ?? []).map((row) => [
      row.lead_id,
      {
        completionStatus: row.completion_status,
        terminationReason: row.termination_reason,
      },
    ]),
  );

  return participants.map((participant) => {
    const screener = screenerByLeadId.get(participant.leadId);

    return {
      ...participant,
      hasScreener: screener !== undefined,
      screenerCompletionStatus: screener?.completionStatus ?? null,
      screenerTerminationReason: screener?.terminationReason ?? null,
    };
  }) satisfies AdminParticipantRow[];
}

export async function listReferrals(limit = 200) {
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const referralRows = data ?? [];
  const leadIds = new Set<string>();
  for (const row of referralRows) {
    if (row.referrer_lead_id) leadIds.add(row.referrer_lead_id);
    if (row.referred_lead_id) leadIds.add(row.referred_lead_id);
  }

  const { data: participants, error: participantsError } = await getSupabaseAdmin()
    .from("participants")
    .select("lead_id, full_name, mobile")
    .in("lead_id", leadIds.size ? Array.from(leadIds) : ["__none__"]);

  if (participantsError) throw participantsError;

  const participantMap = new Map(
    (participants ?? []).map((row) => [row.lead_id, row]),
  );

  return referralRows.map((row) => {
    const referrer = row.referrer_lead_id
      ? participantMap.get(row.referrer_lead_id)
      : null;
    const referred = row.referred_lead_id
      ? participantMap.get(row.referred_lead_id)
      : null;

    return {
      id: row.id,
      referrerName: referrer?.full_name ?? "—",
      referrerMobile: referrer?.mobile ?? "—",
      referredName: referred?.full_name ?? "—",
      referredMobile: referred?.mobile ?? "—",
      rewardStatus: row.reward_status,
      earnedAt: row.earned_at ? new Date(row.earned_at) : null,
      createdAt: new Date(row.created_at),
    } satisfies AdminReferralRow;
  });
}
