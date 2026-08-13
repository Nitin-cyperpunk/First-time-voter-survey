import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FormTerminationInput = {
  leadId: string;
  formType: string;
  formVersion?: number | null;
  ruleKey: string;
  ruleLabel?: string | null;
  questionKey?: string | null;
  questionLabel?: string | null;
  answerValue?: string | null;
  reasonText?: string | null;
  participantStatus?: string | null;
  submittedAt?: Date;
};

export type FormTerminationRow = {
  id: string;
  leadId: string;
  formType: string;
  formVersion: number | null;
  ruleKey: string;
  ruleLabel: string | null;
  questionKey: string | null;
  questionLabel: string | null;
  answerValue: string | null;
  reasonText: string | null;
  participantStatus: string | null;
  submittedAt: string;
  participantName?: string | null;
  participantMobile?: string | null;
};

function isMissingTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42P01" || error.code === "PGRST205")
  );
}

export async function createFormTerminations(
  items: FormTerminationInput[],
): Promise<void> {
  if (items.length === 0) return;

  const payload = items.map((item) => ({
    lead_id: item.leadId,
    form_type: item.formType,
    form_version: item.formVersion ?? null,
    rule_key: item.ruleKey,
    rule_label: item.ruleLabel ?? null,
    question_key: item.questionKey ?? null,
    question_label: item.questionLabel ?? null,
    answer_value: item.answerValue ?? null,
    reason_text: item.reasonText ?? null,
    participant_status: item.participantStatus ?? null,
    submitted_at: (item.submittedAt ?? new Date()).toISOString(),
  }));

  const { error } = await getSupabaseAdmin()
    .from("form_terminations")
    .insert(payload);

  if (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
}

export type TerminationListFilters = {
  formType?: string;
  ruleKey?: string;
  questionKey?: string;
  status?: string;
  leadId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
};

export async function listFormTerminations(
  filters: TerminationListFilters = {},
): Promise<FormTerminationRow[]> {
  let query = getSupabaseAdmin()
    .from("form_terminations")
    .select(
      "id, lead_id, form_type, form_version, rule_key, rule_label, question_key, question_label, answer_value, reason_text, participant_status, submitted_at, participants(full_name, mobile, status)",
    )
    .order("submitted_at", { ascending: false });

  if (filters.formType && filters.formType !== "all") {
    query = query.eq("form_type", filters.formType);
  }
  if (filters.ruleKey && filters.ruleKey !== "all") {
    query = query.eq("rule_key", filters.ruleKey);
  }
  if (filters.questionKey && filters.questionKey !== "all") {
    query = query.eq("question_key", filters.questionKey);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("participant_status", filters.status);
  }
  if (filters.leadId?.trim()) {
    query = query.eq("lead_id", filters.leadId.trim());
  }
  if (filters.fromDate) {
    query = query.gte("submitted_at", filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte("submitted_at", filters.toDate);
  }

  const { data, error } = await query.limit(500);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const rows = (data ?? []) as Array<
    Record<string, unknown> & {
      participants?: { full_name?: string; mobile?: string; status?: string } | null;
    }
  >;

  const mapped = rows.map((row) => ({
    id: String(row.id),
    leadId: String(row.lead_id),
    formType: String(row.form_type),
    formVersion:
      typeof row.form_version === "number" ? row.form_version : null,
    ruleKey: String(row.rule_key),
    ruleLabel: (row.rule_label as string | null) ?? null,
    questionKey: (row.question_key as string | null) ?? null,
    questionLabel: (row.question_label as string | null) ?? null,
    answerValue: (row.answer_value as string | null) ?? null,
    reasonText: (row.reason_text as string | null) ?? null,
    participantStatus:
      (row.participant_status as string | null) ??
      row.participants?.status ??
      null,
    submittedAt: String(row.submitted_at),
    participantName: row.participants?.full_name ?? null,
    participantMobile: row.participants?.mobile ?? null,
  }));

  const search = filters.search?.trim().toLowerCase();
  if (!search) return mapped;

  return mapped.filter((row) => {
    return (
      row.leadId.toLowerCase().includes(search) ||
      (row.participantName ?? "").toLowerCase().includes(search) ||
      (row.participantMobile ?? "").includes(search)
    );
  });
}

export async function getFormTerminationById(
  id: string,
): Promise<FormTerminationRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("form_terminations")
    .select(
      "id, lead_id, form_type, form_version, rule_key, rule_label, question_key, question_label, answer_value, reason_text, participant_status, submitted_at, participants(full_name, mobile, status)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as Record<string, unknown> & {
    participants?: { full_name?: string; mobile?: string; status?: string } | null;
  };

  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    formType: String(row.form_type),
    formVersion:
      typeof row.form_version === "number" ? row.form_version : null,
    ruleKey: String(row.rule_key),
    ruleLabel: (row.rule_label as string | null) ?? null,
    questionKey: (row.question_key as string | null) ?? null,
    questionLabel: (row.question_label as string | null) ?? null,
    answerValue: (row.answer_value as string | null) ?? null,
    reasonText: (row.reason_text as string | null) ?? null,
    participantStatus:
      (row.participant_status as string | null) ??
      row.participants?.status ??
      null,
    submittedAt: String(row.submitted_at),
    participantName: row.participants?.full_name ?? null,
    participantMobile: row.participants?.mobile ?? null,
  };
}

export async function listTerminationFilterOptions() {
  const { data, error } = await getSupabaseAdmin()
    .from("form_terminations")
    .select("form_type, rule_key, question_key, participant_status");

  if (error) {
    if (isMissingTable(error)) {
      return {
        formTypes: [] as string[],
        ruleKeys: [] as string[],
        questionKeys: [] as string[],
        statuses: [] as string[],
      };
    }
    throw error;
  }

  const formTypes = new Set<string>();
  const ruleKeys = new Set<string>();
  const questionKeys = new Set<string>();
  const statuses = new Set<string>();

  for (const row of data ?? []) {
    if (row.form_type) formTypes.add(String(row.form_type));
    if (row.rule_key) ruleKeys.add(String(row.rule_key));
    if (row.question_key) questionKeys.add(String(row.question_key));
    if (row.participant_status) statuses.add(String(row.participant_status));
  }

  return {
    formTypes: [...formTypes].sort(),
    ruleKeys: [...ruleKeys].sort(),
    questionKeys: [...questionKeys].sort(),
    statuses: [...statuses].sort(),
  };
}

export async function hasRegistrationFormTerminations(
  leadId: string,
): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from("form_terminations")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("form_type", "registration");

  if (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }

  return (count ?? 0) > 0;
}

export async function listRegistrationTerminationsByLeadId(
  leadId: string,
): Promise<FormTerminationRow[]> {
  return listFormTerminations({
    formType: "registration",
    leadId,
  });
}

export async function deleteFormTerminationsByLeadId(leadId: string) {
  const { error } = await getSupabaseAdmin()
    .from("form_terminations")
    .delete()
    .eq("lead_id", leadId);

  if (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
}
