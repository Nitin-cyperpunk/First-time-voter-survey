import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { pendingRewardReason } from "@/lib/referrals/pending-reward-reason";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getRewardAmounts } from "@/lib/study-config/rewards";

export type ReferralPayoutDetail = {
  id: string;
  referredLeadId: string | null;
  referredName: string;
  referredMobile: string;
  referredStatus: string | null;
  rewardStatus: string;
  rewardAmount: number | null;
  countsTowardPayable: boolean;
  earnedAt: string | null;
  createdAt: string;
  pendingKind: "terminated" | "duplicate_qc" | "other" | null;
  /** Why a pending referral will never be paid, or why it is still waiting. */
  pendingReason: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { leadId } = await params;

  try {
    const { referralRewardAmount } = await getRewardAmounts();

    // Fetch all referrals for this referrer (all statuses, for drawer breakdown).
    const { data: referrals, error: refErr } = await getSupabaseAdmin()
      .from("referrals")
      .select("id, referred_lead_id, reward_status, reward_amount, earned_at, created_at")
      .eq("referrer_lead_id", leadId)
      .order("created_at", { ascending: false });

    if (refErr) throw refErr;

    if (!referrals || referrals.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const referredIds = referrals
      .map((r) => r.referred_lead_id)
      .filter(Boolean) as string[];

    // Fetch referred participants for name, mobile, status, duplicate flags.
    const { data: referred, error: pErr } = await getSupabaseAdmin()
      .from("participants")
      .select("lead_id, full_name, mobile, status, is_flagged_duplicate, duplicate_flag, duplicate_reason")
      .in("lead_id", referredIds.length ? referredIds : ["__none__"]);

    if (pErr) throw pErr;

    const { data: screenerRows, error: screenerErr } = await getSupabaseAdmin()
      .from("screener_responses")
      .select("lead_id, termination_reason")
      .in("lead_id", referredIds.length ? referredIds : ["__none__"]);

    if (screenerErr) throw screenerErr;

    const byId = new Map(
      (referred ?? []).map((p) => [p.lead_id, p]),
    );
    const terminationReasonByLead = new Map(
      (screenerRows ?? []).map((row) => [row.lead_id, row.termination_reason ?? null]),
    );

    function pendingKind(
      rewardStatus: string,
      participant: ReturnType<typeof byId.get>,
    ): ReferralPayoutDetail["pendingKind"] {
      if (rewardStatus !== "pending") return null;
      if (!participant) return "other";
      if (participant.status === "terminated") return "terminated";
      if (participant.is_flagged_duplicate || participant.duplicate_flag) {
        return "duplicate_qc";
      }
      return "other";
    }

    const rows: ReferralPayoutDetail[] = referrals.map((r) => {
      const p = r.referred_lead_id ? byId.get(r.referred_lead_id) : undefined;
      const stored =
        r.reward_amount !== null && r.reward_amount !== undefined
          ? Number(r.reward_amount)
          : NaN;
      const amount = r.reward_status === "pending"
        ? (Number.isFinite(stored) ? stored : referralRewardAmount)
        : (Number.isFinite(stored) ? stored : referralRewardAmount);
      return {
        id: r.id,
        referredLeadId: r.referred_lead_id ?? null,
        referredName: p?.full_name || "Anonymous",
        referredMobile: p?.mobile ?? "",
        referredStatus: p?.status ?? null,
        rewardStatus: r.reward_status,
        rewardAmount: Number.isFinite(amount) ? amount : null,
        countsTowardPayable:
          r.reward_status === "earned" && !(p?.duplicate_flag ?? false),
        earnedAt: r.earned_at ?? null,
        createdAt: r.created_at,
        pendingKind: pendingKind(r.reward_status, p),
        pendingReason: pendingRewardReason({
          rewardStatus: r.reward_status,
          referredFound: Boolean(r.referred_lead_id && p),
          referredStatus: p?.status ?? null,
          terminationReason: r.referred_lead_id
            ? (terminationReasonByLead.get(r.referred_lead_id) ?? null)
            : null,
        }),
      };
    });

    return NextResponse.json({ rows });
  } catch (error) {
    console.error(`GET /api/admin/payouts/${leadId}/referrals failed:`, error);
    return NextResponse.json(
      { error: "Failed to load referral details." },
      { status: 500 },
    );
  }
}
