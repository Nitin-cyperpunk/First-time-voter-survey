import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type TimelineEvent = {
  timestamp: Date;
  event: string;
  actor: string;
  notes: string | null;
};

type StatusHistoryRow = {
  changed_at: string;
  status: string;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  notes: string | null;
};

export async function getParticipantTimeline(
  leadId: string,
): Promise<TimelineEvent[]> {
  const supabase = getSupabaseAdmin();

  const [
    { data: participant },
    { data: incomingReferral },
    { data: screener },
    { data: payout },
    { data: statusHistory },
  ] = await Promise.all([
    supabase
      .from("participants")
      .select("created_at, status, referred_by")
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("referrals")
      .select("created_at")
      .eq("referred_lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("screener_responses")
      .select("submitted_at, started_at")
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("payouts")
      .select("payment_status, payment_date, updated_at")
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("status_history")
      .select(
        "changed_at, status, old_status, new_status, changed_by, notes",
      )
      .eq("lead_id", leadId)
      .order("changed_at", { ascending: true }),
  ]);

  if (!participant) return [];

  const events: TimelineEvent[] = [
    {
      timestamp: new Date(participant.created_at),
      event: "Registered",
      actor: "participant",
      notes: null,
    },
    {
      timestamp: new Date(participant.created_at),
      event: "Lead created",
      actor: "system",
      notes: leadId,
    },
  ];

  if (incomingReferral?.created_at) {
    events.push({
      timestamp: new Date(incomingReferral.created_at),
      event: "Referral created",
      actor: "system",
      notes: participant.referred_by
        ? `Referred by ${participant.referred_by}`
        : null,
    });
  }

  if (screener?.submitted_at) {
    events.push({
      timestamp: new Date(screener.submitted_at),
      event: "Screener submitted",
      actor: "participant",
      notes: null,
    });
  }

  if (screener?.started_at) {
    events.push({
      timestamp: new Date(screener.started_at),
      event: "Screener started",
      actor: "participant",
      notes: null,
    });
  }

  for (const entry of (statusHistory ?? []) as StatusHistoryRow[]) {
    const label = formatStatusEvent(entry.new_status ?? entry.status);
    if (!label) continue;

    events.push({
      timestamp: new Date(entry.changed_at),
      event: label,
      actor: entry.changed_by ?? "system",
      notes: entry.notes,
    });
  }

  if (payout?.payment_status === "paid" && payout.payment_date) {
    events.push({
      timestamp: new Date(payout.payment_date),
      event: "Paid",
      actor: "admin",
      notes: null,
    });
  } else if (payout?.payment_status === "paid") {
    events.push({
      timestamp: new Date(payout.updated_at),
      event: "Paid",
      actor: "admin",
      notes: null,
    });
  }

  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.event}:${event.timestamp.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatStatusEvent(status: string | null): string | null {
  if (!status) return null;

  const normalized = status.toLowerCase();
  if (normalized === "eligible") return "Eligible";
  if (normalized === "not_eligible") return "Not eligible";
  if (normalized === "completed") return "Survey completed";
  if (normalized === "review_pass" || normalized === "qc_pass") return "Review pass";
  if (normalized === "review_fail" || normalized === "qc_fail") return "Review fail";
  if (normalized === "successful") return "Successful";
  if (normalized === "unsuccessful") return "Unsuccessful";
  if (normalized === "paid") return "Paid";
  if (normalized === "lead") return null;
  return status.replaceAll("_", " ");
}
