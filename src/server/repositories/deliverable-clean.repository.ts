import { QUALIFIED_COMPLETION_STATUSES } from "@/features/respondents/lib/metric-status-sets";
import {
  isDeliverableClean,
  toDeliverableRow,
} from "@/lib/respondents/duplicate-visibility";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Live deliverable-clean count — same definition as the dashboard Clean card. */
export async function countDeliverableClean(): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select(
      "status, duplicate_flag, is_flagged_duplicate, survey_data_incomplete",
    )
    .is("deleted_at", null)
    .in("status", [...QUALIFIED_COMPLETION_STATUSES]);

  if (error) throw error;

  return (data ?? []).filter((row) =>
    isDeliverableClean(toDeliverableRow(row)),
  ).length;
}
