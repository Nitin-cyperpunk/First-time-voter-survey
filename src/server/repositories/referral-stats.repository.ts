import { getRewardAmounts } from "@/lib/study-config/rewards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ParticipantReferralStats = {
  referredCount: number;
  qualifiedCount: number;
  totalEarned: number;
};

export async function getParticipantReferralStats(
  leadId: string,
): Promise<ParticipantReferralStats> {
  const { referralRewardAmount } = await getRewardAmounts();
  const { data, error, count } = await getSupabaseAdmin()
    .from("referrals")
    .select("reward_status, reward_amount", { count: "exact" })
    .eq("referrer_lead_id", leadId);

  if (error) {
    // Keep the dashboard available before migration 021 is applied. Once the
    // reward_amount column exists, the primary query above is used.
    if (error.code !== "42703") throw error;

    const fallback = await getSupabaseAdmin()
      .from("referrals")
      .select("reward_status", { count: "exact" })
      .eq("referrer_lead_id", leadId);

    if (fallback.error) throw fallback.error;

    const fallbackRows = fallback.data ?? [];
    const qualifiedCount = fallbackRows.filter(
      (row) => row.reward_status === "earned",
    ).length;

    return {
      referredCount: fallback.count ?? fallbackRows.length,
      qualifiedCount,
      totalEarned: qualifiedCount * referralRewardAmount,
    };
  }

  const rows = data ?? [];
  let qualifiedCount = 0;
  let totalEarned = 0;

  for (const row of rows) {
    if (row.reward_status !== "earned") continue;

    qualifiedCount += 1;
    const amount =
      row.reward_amount !== null && row.reward_amount !== undefined
        ? Number(row.reward_amount)
        : referralRewardAmount;
    totalEarned += Number.isFinite(amount) ? amount : referralRewardAmount;
  }

  return {
    referredCount: count ?? rows.length,
    qualifiedCount,
    totalEarned,
  };
}
