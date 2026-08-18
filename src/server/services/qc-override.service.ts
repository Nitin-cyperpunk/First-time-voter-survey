import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeAutoQcStatus,
  computeEffectiveQcStatus,
  validateQcOverrideReason,
  type QcStatusValue,
} from "@/lib/respondents/qc-status";
import { toDeliverableRow } from "@/lib/respondents/duplicate-visibility";
import type { AdminUserRecord } from "@/server/repositories/admin-users.repository";

export type QcOverrideLogEntry = {
  id: string;
  leadId: string;
  previousAutoStatus: QcStatusValue;
  newAutoStatus: QcStatusValue;
  previousEffectiveStatus: QcStatusValue;
  newEffectiveStatus: QcStatusValue;
  previousOverride: QcStatusValue | null;
  newOverride: QcStatusValue;
  reason: string;
  changedByAdminId: string | null;
  changedByEmail: string;
  createdAt: string;
};

type ParticipantQcRow = {
  lead_id: string;
  status: string;
  duplicate_flag: boolean | null;
  is_flagged_duplicate: boolean | null;
  qc_status_override: string | null;
  survey_data_incomplete: boolean | null;
};

function mapLogRow(row: Record<string, unknown>): QcOverrideLogEntry {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    previousAutoStatus: row.previous_auto_status as QcStatusValue,
    newAutoStatus: row.new_auto_status as QcStatusValue,
    previousEffectiveStatus: row.previous_effective_status as QcStatusValue,
    newEffectiveStatus: row.new_effective_status as QcStatusValue,
    previousOverride: (row.previous_override as QcStatusValue | null) ?? null,
    newOverride: row.new_override as QcStatusValue,
    reason: String(row.reason),
    changedByAdminId: row.changed_by_admin_id
      ? String(row.changed_by_admin_id)
      : null,
    changedByEmail: String(row.changed_by_email),
    createdAt: String(row.created_at),
  };
}

function toQcRow(row: ParticipantQcRow) {
  return {
    status: row.status,
    duplicateFlag: row.duplicate_flag === true,
    isFlaggedDuplicate: row.is_flagged_duplicate === true,
    surveyDataIncomplete: row.survey_data_incomplete === true,
    qcStatusOverride: (row.qc_status_override as QcStatusValue | null) ?? null,
  };
}

export async function listQcOverrideLog(leadId: string): Promise<QcOverrideLogEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("participant_qc_override_log")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }

  return (data ?? []).map((row) => mapLogRow(row as Record<string, unknown>));
}

export async function applyQcOverride(input: {
  leadId: string;
  newOverride: QcStatusValue;
  reason: string;
  admin: AdminUserRecord;
}) {
  if (!validateQcOverrideReason(input.reason)) {
    throw new Error("QC_OVERRIDE_REASON_TOO_SHORT");
  }

  const { data: participant, error: fetchError } = await getSupabaseAdmin()
    .from("participants")
    .select(
      "lead_id, status, duplicate_flag, is_flagged_duplicate, qc_status_override, survey_data_incomplete",
    )
    .eq("lead_id", input.leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!participant) throw new Error("PARTICIPANT_NOT_FOUND");

  const row = participant as ParticipantQcRow;
  const qcRow = toQcRow(row);
  const previousAuto = computeAutoQcStatus(qcRow);
  const previousEffective = computeEffectiveQcStatus(qcRow);
  const previousOverride = qcRow.qcStatusOverride;

  const nextRow = { ...qcRow, qcStatusOverride: input.newOverride };
  const newAuto = computeAutoQcStatus(nextRow);
  const newEffective = computeEffectiveQcStatus(nextRow);

  const { error: rpcError } = await getSupabaseAdmin().rpc(
    "apply_participant_qc_override",
    {
      p_lead_id: input.leadId,
      p_new_override: input.newOverride,
      p_reason: input.reason.trim(),
      p_previous_auto: previousAuto,
      p_new_auto: newAuto,
      p_previous_effective: previousEffective,
      p_new_effective: newEffective,
      p_previous_override: previousOverride,
      p_admin_id: input.admin.id,
      p_admin_email: input.admin.email,
    },
  );

  if (rpcError) {
    if (rpcError.message?.includes("QC_OVERRIDE_REASON_TOO_SHORT")) {
      throw new Error("QC_OVERRIDE_REASON_TOO_SHORT");
    }
    if (rpcError.message?.includes("PARTICIPANT_NOT_FOUND")) {
      throw new Error("PARTICIPANT_NOT_FOUND");
    }
    throw rpcError;
  }

  return {
    leadId: input.leadId,
    qcStatusOverride: input.newOverride,
    autoStatus: newAuto,
    effectiveStatus: newEffective,
    deliverableRow: toDeliverableRow(row),
  };
}
