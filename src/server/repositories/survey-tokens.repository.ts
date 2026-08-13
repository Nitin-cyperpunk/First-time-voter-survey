import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SurveyTokenRow = {
  id: string;
  lead_id: string;
  token: string;
  form_version: number | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  is_active: boolean;
};

function isMissingTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42P01" || error.code === "PGRST205")
  );
}

export async function findSurveyTokenRow(token: string): Promise<SurveyTokenRow | null> {
  const normalized = token.trim();
  if (!normalized) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("survey_tokens")
    .select("*")
    .eq("token", normalized)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }

  return (data as SurveyTokenRow | null) ?? null;
}

export async function deactivateSurveyTokensForLead(leadId: string) {
  const { error } = await getSupabaseAdmin()
    .from("survey_tokens")
    .update({ is_active: false })
    .eq("lead_id", leadId)
    .eq("is_active", true);

  if (error && !isMissingTable(error)) throw error;
}

export async function createSurveyTokenRow(input: {
  leadId: string;
  token: string;
  formVersion: number | null;
  expiresAt: Date;
  createdBy?: string | null;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_tokens")
    .insert({
      lead_id: input.leadId,
      token: input.token,
      form_version: input.formVersion,
      expires_at: input.expiresAt.toISOString(),
      created_by: input.createdBy ?? "admin",
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      throw new Error("SURVEY_TOKENS_MIGRATION_PENDING");
    }
    throw error;
  }

  return data as SurveyTokenRow;
}

export async function markSurveyTokenUsed(token: string) {
  const { error } = await getSupabaseAdmin()
    .from("survey_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token.trim());

  if (error && !isMissingTable(error)) throw error;
}

export async function tokenExists(token: string): Promise<boolean> {
  const row = await findSurveyTokenRow(token);
  return row !== null;
}
