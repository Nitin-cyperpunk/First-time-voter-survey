import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getRewardAmounts } from "@/lib/study-config/rewards";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";

export type PaymentStatus = "pending" | "ready" | "paid";

export type PayoutRow = {
  leadId: string;
  fullName: string;
  mobile: string;
  email: string | null;
  city: string | null;
  referralCode: string;
  referralEarnings: number;
  surveyEarnings: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentDate: Date | null;
  upiId: string | null;
  /** Active survey form name — used as RazorpayX narration. */
  surveyName: string;
  /** Comma-joined referred names — used as RazorpayX notes. */
  referralsName: string;
  /** No Razorpay/invoice id stored today; export leaves blank. */
  payoutReferenceId: string | null;
  qcStatus: string;
  isFlaggedDuplicate: boolean;
  duplicateFlag: boolean;
  duplicateReason: string | null;
  ipAddress: string | null;
  originalParticipantLeadId: string | null;
  /** All lead IDs sharing this participant's IP (including self). */
  ipAssociatedLeadIds: string[];
  createdAt: Date | null;
};

export type PayoutListParams = {
  search?: string;
  paymentStatus?: PaymentStatus | "all";
  sortBy:
    | "leadId"
    | "fullName"
    | "totalAmount"
    | "paymentStatus"
    | "paymentDate";
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

type ParticipantPayoutRow = {
  lead_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  city: string | null;
  status: string;
  upi_id: string | null;
  referral_code: string;
  is_flagged_duplicate: boolean | null;
  duplicate_flag: boolean | null;
  duplicate_reason: string | null;
  ip_address: string | null;
  original_participant_lead_id: string | null;
  created_at: string | null;
  payouts:
    | { payment_status: string; payment_date: string | null }
    | { payment_status: string; payment_date: string | null }[]
    | null;
};

function surveyEarningsForStatus(
  status: string,
  surveyRewardAmount: number,
): number {
  const normalized = status.toLowerCase();
  if (
    normalized === "review_pass" ||
    normalized === "successful" ||
    normalized === "qc_pass"
  ) {
    return surveyRewardAmount;
  }
  return 0;
}

function normalizePayoutJoin(
  payouts: ParticipantPayoutRow["payouts"],
): { payment_status: string; payment_date: string | null } | null {
  if (!payouts) return null;
  return Array.isArray(payouts) ? (payouts[0] ?? null) : payouts;
}

function matchesSearch(row: ParticipantPayoutRow, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    row.lead_id.toLowerCase().includes(needle) ||
    row.full_name.toLowerCase().includes(needle) ||
    row.mobile.includes(needle) ||
    row.referral_code.toLowerCase().includes(needle) ||
    (row.ip_address ?? "").toLowerCase().includes(needle)
  );
}

function compareRows(
  a: PayoutRow,
  b: PayoutRow,
  sortBy: PayoutListParams["sortBy"],
  sortDir: PayoutListParams["sortDir"],
): number {
  let cmp = 0;
  switch (sortBy) {
    case "fullName":
      cmp = a.fullName.localeCompare(b.fullName);
      break;
    case "totalAmount":
      cmp = a.totalAmount - b.totalAmount;
      break;
    case "paymentStatus":
      cmp = a.paymentStatus.localeCompare(b.paymentStatus);
      break;
    case "paymentDate": {
      const aTime = a.paymentDate?.getTime() ?? 0;
      const bTime = b.paymentDate?.getTime() ?? 0;
      cmp = aTime - bTime;
      break;
    }
    default:
      cmp = a.leadId.localeCompare(b.leadId);
  }
  return sortDir === "asc" ? cmp : -cmp;
}

export async function listPayouts(params: PayoutListParams) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(10_000, Math.max(1, params.pageSize));
  const { surveyRewardAmount, referralRewardAmount } = await getRewardAmounts();
  const activeSurvey = await getActivePublishedForm("survey");
  const surveyName = (activeSurvey?.name ?? "Survey").trim() || "Survey";

  const { data: participants, error } = await getSupabaseAdmin()
    .from("participants")
    .select(
      "lead_id, full_name, mobile, email, city, status, upi_id, referral_code, is_flagged_duplicate, duplicate_flag, duplicate_reason, ip_address, original_participant_lead_id, created_at, payouts(payment_status, payment_date)",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (participants ?? []) as ParticipantPayoutRow[];
  const leadIds = rows.map((row) => row.lead_id);
  const nameByLeadId = new Map(
    rows.map((row) => [row.lead_id, row.full_name] as const),
  );

  const leadsByIp = new Map<string, string[]>();
  for (const row of rows) {
    const ip = row.ip_address?.trim();
    if (!ip) continue;
    const existing = leadsByIp.get(ip);
    if (existing) {
      existing.push(row.lead_id);
    } else {
      leadsByIp.set(ip, [row.lead_id]);
    }
  }
  for (const [ip, leads] of leadsByIp) {
    leadsByIp.set(ip, [...new Set(leads)].sort((a, b) => a.localeCompare(b)));
  }

  const { data: referrals, error: referralsError } = await getSupabaseAdmin()
    .from("referrals")
    .select("referrer_lead_id, referred_lead_id, reward_status, reward_amount")
    .in("referrer_lead_id", leadIds.length ? leadIds : ["__none__"])
    .in("reward_status", ["earned", "paid"]);

  if (referralsError) throw referralsError;

  const referralEarningsByLead = new Map<string, number>();
  const referredNamesByLead = new Map<string, string[]>();
  for (const referral of referrals ?? []) {
    if (!referral.referrer_lead_id) continue;
    const stored =
      referral.reward_amount !== null && referral.reward_amount !== undefined
        ? Number(referral.reward_amount)
        : NaN;
    const amount = Number.isFinite(stored) ? stored : referralRewardAmount;
    referralEarningsByLead.set(
      referral.referrer_lead_id,
      (referralEarningsByLead.get(referral.referrer_lead_id) ?? 0) + amount,
    );

    const referredName =
      (referral.referred_lead_id
        ? nameByLeadId.get(referral.referred_lead_id)
        : null) ?? "";
    if (referredName.trim()) {
      const names = referredNamesByLead.get(referral.referrer_lead_id) ?? [];
      if (!names.includes(referredName)) {
        names.push(referredName);
        referredNamesByLead.set(referral.referrer_lead_id, names);
      }
    }
  }

  let payoutRows: PayoutRow[] = rows.map((row) => {
    const payout = normalizePayoutJoin(row.payouts);
    const referralEarnings = referralEarningsByLead.get(row.lead_id) ?? 0;
    const surveyEarnings = surveyEarningsForStatus(
      row.status,
      surveyRewardAmount,
    );
    const paymentStatus = (payout?.payment_status ??
      "pending") as PaymentStatus;

    return {
      leadId: row.lead_id,
      fullName: row.full_name,
      mobile: row.mobile,
      email: row.email ?? null,
      city: row.city,
      referralCode: row.referral_code,
      referralEarnings,
      surveyEarnings,
      totalAmount: referralEarnings + surveyEarnings,
      paymentStatus,
      paymentDate: payout?.payment_date ? new Date(payout.payment_date) : null,
      upiId: row.upi_id,
      surveyName,
      referralsName: (referredNamesByLead.get(row.lead_id) ?? []).join(", "),
      payoutReferenceId: null,
      qcStatus: row.status,
      isFlaggedDuplicate: Boolean(row.is_flagged_duplicate),
      duplicateFlag: Boolean(row.duplicate_flag),
      duplicateReason: row.duplicate_reason,
      ipAddress: row.ip_address,
      originalParticipantLeadId: row.original_participant_lead_id,
      ipAssociatedLeadIds: row.ip_address?.trim()
        ? (leadsByIp.get(row.ip_address.trim()) ?? [row.lead_id])
        : [],
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  });

  if (params.search?.trim()) {
    const search = params.search.trim();
    const filteredParticipants = rows.filter((row) => matchesSearch(row, search));
    const allowedLeadIds = new Set(filteredParticipants.map((row) => row.lead_id));
    payoutRows = payoutRows.filter((row) => allowedLeadIds.has(row.leadId));
  }

  if (params.paymentStatus && params.paymentStatus !== "all") {
    payoutRows = payoutRows.filter(
      (row) => row.paymentStatus === params.paymentStatus,
    );
  }

  payoutRows.sort((a, b) =>
    compareRows(a, b, params.sortBy, params.sortDir),
  );

  const total = payoutRows.length;
  const offset = (page - 1) * pageSize;

  return {
    rows: payoutRows.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
  };
}
