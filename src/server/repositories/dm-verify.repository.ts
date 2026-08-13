import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mapParticipant } from "@/server/repositories/participants.repository";
import type { Participant } from "@/types/domain";

export type DmVerifyParticipantRow = Participant & {
  surveyUrl: string | null;
};

export async function listDmVerifyParticipants(limit = 300) {
  // Eligible queue + Not Eligible with a call disposition (reached DM & Verify).
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .or(
      "status.eq.eligible,and(status.eq.not_eligible,call_disposition.not.is.null)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const participant = mapParticipant(row);
    return { ...participant, surveyUrl: null } satisfies DmVerifyParticipantRow;
  });
}
