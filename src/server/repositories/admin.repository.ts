import { isTerminatedStatus } from "@/lib/participant-lifecycle";
import { pendingRewardReason } from "@/lib/referrals/pending-reward-reason";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { Participant } from "@/types/domain";
import { mapParticipant } from "@/server/repositories/participants.repository";

export type AdminParticipantRow = Participant & {
  hasScreener: boolean;
  screenerCompletionStatus: string | null;
  screenerTerminationReason: string | null;
};

export type AdminReferralRow = {
  id: string;
  referrerLeadId: string | null;
  referredLeadId: string | null;
  referrerName: string;
  referrerMobile: string;
  referredName: string;
  referredMobile: string;
  rewardStatus: string;
  rewardAmount: number | null;
  pendingReason: string | null;
  referredStatus: string | null;
  terminationReason: string | null;
  earnedAt: Date | null;
  createdAt: Date;
};

/** Match the REFERRER only — never the referred participant. */
function matchesReferrerSearch(
  row: Pick<
    AdminReferralRow,
    "referrerName" | "referrerMobile" | "referrerLeadId"
  >,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const displayName = (row.referrerName.trim() || "Anonymous").toLowerCase();
  const mobile = row.referrerMobile.toLowerCase();
  const leadId = (row.referrerLeadId ?? "").toLowerCase();
  return (
    displayName.includes(needle) ||
    mobile.includes(needle) ||
    leadId.includes(needle)
  );
}

export async function listParticipants(limit = 200) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const participants = (data ?? []).map(mapParticipant);
  const leadIds = participants.map((p) => p.leadId);
  const screeners = await fetchRowsByLeadId<{
    lead_id: string;
    completion_status: string | null;
    termination_reason: string | null;
  }>("screener_responses", "lead_id, completion_status, termination_reason", leadIds);

  const screenerByLeadId = new Map(
    screeners.map((row) => [
      row.lead_id,
      {
        completionStatus: row.completion_status,
        terminationReason: row.termination_reason,
      },
    ]),
  );

  const missing = participants.filter(
    (participant) => !screenerByLeadId.has(participant.leadId),
  );
  if (missing.length > 0) {
    const recovered = await backfillMissingScreenerRows(missing);
    for (const [leadId, screener] of recovered) {
      screenerByLeadId.set(leadId, screener);
    }
  }

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

async function fetchRowsByLeadId<T>(
  table: "screener_responses" | "ftv_responses",
  columns: string,
  leadIds: string[],
): Promise<T[]> {
  if (leadIds.length === 0) return [];
  const chunkSize = 80;
  const rows: T[] = [];
  for (let index = 0; index < leadIds.length; index += chunkSize) {
    const chunk = leadIds.slice(index, index + chunkSize);
    const { data, error } = await getSupabaseAdmin()
      .from(table)
      .select(columns)
      .in("lead_id", chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

function flattenFtvPayloadAnswers(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const responses = (payload as { responses?: unknown }).responses;
  if (!Array.isArray(responses)) return {};
  const answers: Record<string, unknown> = {};
  for (const row of responses) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const qid = String(rec.qid ?? "").trim();
    if (!qid) continue;
    const value =
      rec.answer !== undefined && rec.answer !== null && rec.answer !== ""
        ? rec.answer
        : rec.answer_code;
    if (value === undefined || value === null || value === "") continue;
    const current = answers[qid];
    if (current === undefined) answers[qid] = value;
    else if (Array.isArray(current)) current.push(value);
    else answers[qid] = [current, value];
  }
  return answers;
}

async function backfillMissingScreenerRows(
  missing: Participant[],
): Promise<
  Map<string, { completionStatus: string | null; terminationReason: string | null }>
> {
  const recovered = new Map<
    string,
    { completionStatus: string | null; terminationReason: string | null }
  >();
  const ftvRows = await fetchRowsByLeadId<{
    lead_id: string | null;
    payload: unknown;
    status: string | null;
  }>("ftv_responses", "lead_id, payload, status", missing.map((row) => row.leadId));
  const ftvByLead = new Map(
    ftvRows
      .filter((row) => row.lead_id)
      .map((row) => [row.lead_id as string, row]),
  );

  const inserts = missing.map((participant) => {
    const terminated = isTerminatedStatus(participant.status);
    const ftv = ftvByLead.get(participant.leadId);
    const answers = flattenFtvPayloadAnswers(ftv?.payload) as Json;
    const completionStatus = terminated ? "Terminated" : "Completed";
    const cityId = participant.cityId?.trim() || null;
    return {
      lead_id: participant.leadId,
      form_version: 1,
      answers,
      analytics: (ftv?.payload && typeof ftv.payload === "object"
        ? { __ftv_payload: ftv.payload }
        : {}) as Json,
      completion_status: completionStatus,
      termination_reason: terminated ? participant.status : null,
      submitted_at: participant.createdAt.toISOString(),
      city_id: cityId,
      city_raw: participant.city,
      city_match_type: cityId ? "exact" : "unmatched",
    };
  });

  if (inserts.length === 0) return recovered;

  for (const row of inserts) {
    const { error } = await getSupabaseAdmin()
      .from("screener_responses")
      .insert(row);
    if (error) {
      console.error(
        "[listParticipants] screener backfill failed for",
        row.lead_id,
        error.message,
      );
      continue;
    }
    recovered.set(row.lead_id, {
      completionStatus: row.completion_status,
      terminationReason: row.termination_reason,
    });
  }
  return recovered;
}

export async function listReferrals(options?: {
  referrerSearch?: string;
  limit?: number;
}) {
  const limit = Math.min(10_000, Math.max(1, options?.limit ?? 10_000));
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const referralRows = data ?? [];
  const leadIds = new Set<string>();
  const referredLeadIds: string[] = [];
  for (const row of referralRows) {
    if (row.referrer_lead_id) leadIds.add(row.referrer_lead_id);
    if (row.referred_lead_id) {
      leadIds.add(row.referred_lead_id);
      referredLeadIds.push(row.referred_lead_id);
    }
  }

  const { data: participants, error: participantsError } = await getSupabaseAdmin()
    .from("participants")
    .select("lead_id, full_name, mobile, status")
    .in("lead_id", leadIds.size ? Array.from(leadIds) : ["__none__"]);

  if (participantsError) throw participantsError;

  const participantMap = new Map(
    (participants ?? []).map((row) => [row.lead_id, row]),
  );

  const uniqueReferred = [...new Set(referredLeadIds)];
  const { data: screeners, error: screenersError } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("lead_id, termination_reason")
    .in("lead_id", uniqueReferred.length ? uniqueReferred : ["__none__"]);

  if (screenersError) throw screenersError;

  const terminationByLead = new Map<string, string | null>();
  for (const row of screeners ?? []) {
    terminationByLead.set(row.lead_id, row.termination_reason ?? null);
  }

  const mapped = referralRows.map((row) => {
    const referrer = row.referrer_lead_id
      ? participantMap.get(row.referrer_lead_id)
      : undefined;
    const referred = row.referred_lead_id
      ? participantMap.get(row.referred_lead_id)
      : undefined;
    const referredFound = Boolean(row.referred_lead_id && referred);
    const parsedAmount =
      row.reward_amount == null ? null : Number(row.reward_amount);
    const rewardAmount =
      parsedAmount != null && Number.isFinite(parsedAmount) ? parsedAmount : null;

    return {
      id: row.id,
      referrerLeadId: row.referrer_lead_id ?? null,
      referredLeadId: row.referred_lead_id ?? null,
      referrerName: referrer?.full_name ?? "",
      referrerMobile: referrer?.mobile ?? "",
      referredName: referred?.full_name ?? "",
      referredMobile: referred?.mobile ?? "",
      rewardStatus: row.reward_status,
      rewardAmount,
      referredStatus: referred?.status ?? null,
      terminationReason: row.referred_lead_id
        ? (terminationByLead.get(row.referred_lead_id) ?? null)
        : null,
      pendingReason: pendingRewardReason({
        rewardStatus: row.reward_status,
        referredFound,
        referredStatus: referred?.status ?? null,
        terminationReason: row.referred_lead_id
          ? (terminationByLead.get(row.referred_lead_id) ?? null)
          : null,
      }),
      earnedAt: row.earned_at ? new Date(row.earned_at) : null,
      createdAt: new Date(row.created_at),
    } satisfies AdminReferralRow;
  });

  const search = options?.referrerSearch?.trim() ?? "";
  if (!search) return mapped;
  // Referrer-side only: does not match referred name or referred mobile.
  return mapped.filter((row) => matchesReferrerSearch(row, search));
}
