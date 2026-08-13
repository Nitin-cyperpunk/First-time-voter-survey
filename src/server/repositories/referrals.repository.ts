import { getRewardAmounts } from "@/lib/study-config/rewards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Referral } from "@/types/domain";

type ReferralRow = {
  id: string;
  referrer_lead_id: string | null;
  referred_lead_id: string | null;
  referral_code: string | null;
  reward_status: string;
  earned_at: string | null;
  paid_at: string | null;
  created_at: string;
};

function mapReferral(row: ReferralRow): Referral {
  return {
    id: row.id,
    referrerLeadId: row.referrer_lead_id,
    referredLeadId: row.referred_lead_id,
    referralCode: row.referral_code,
    rewardStatus: row.reward_status,
    earnedAt: row.earned_at ? new Date(row.earned_at) : null,
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export async function createReferral(input: {
  referrerLeadId: string;
  referredLeadId: string;
  referralCode?: string | null;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .insert({
      referrer_lead_id: input.referrerLeadId,
      referred_lead_id: input.referredLeadId,
      referral_code: input.referralCode ?? null,
      reward_status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapReferral(data as ReferralRow);
}

export async function markReferralEarnedForReferredLeadId(referredLeadId: string) {
  const { referralRewardAmount } = await getRewardAmounts();
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .update({
      reward_status: "earned",
      earned_at: now,
      reward_amount: referralRewardAmount,
    })
    .eq("referred_lead_id", referredLeadId)
    .eq("reward_status", "pending")
    .is("earned_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapReferral(data as ReferralRow) : null;
}

export async function findByReferrer(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .select("*")
    .eq("referrer_lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapReferral(row as ReferralRow));
}
