import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countQualifiedCompletions } from "@/server/repositories/cities.repository";
import { logConfigChange } from "@/server/repositories/config-audit.repository";
import type { AdminUser } from "@/lib/auth/admin-session";

export class RespondentDeleteError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RespondentDeleteError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DeletedRespondentRow = {
  leadId: string;
  fullName: string;
  mobile: string;
  city: string | null;
  status: string;
  deletedAt: string;
  deletedBy: string | null;
  deleteReason: string | null;
  screenerCompletionStatus: string | null;
  createdAt: string;
};

export type SlotRelease = {
  cityId: string | null;
  cityName: string | null;
  previousCount: number;
  newCount: number;
  capacity: number | null;
  cityReopened: boolean;
};

type SoftStamp = {
  deleted_at: string;
  deleted_by: string;
  delete_reason: string;
};

function stamp(adminId: string, reason: string): SoftStamp {
  return {
    deleted_at: new Date().toISOString(),
    deleted_by: adminId,
    delete_reason: reason,
  };
}

async function loadParticipantRow(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("lead_id, full_name, mobile, city, city_id, status, deleted_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadScreenerRow(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("screener_responses")
    .select("lead_id, city_id, completion_status, submitted_at, deleted_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCity(cityId: string | null) {
  if (!cityId) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("cities")
    .select("id, name, capacity, is_open")
    .eq("id", cityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function measureSlot(cityId: string | null): Promise<SlotRelease> {
  const city = await loadCity(cityId);
  const count = cityId
    ? await countQualifiedCompletions({ cityId })
    : await countQualifiedCompletions();
  return {
    cityId: city?.id ?? cityId,
    cityName: city?.name ?? null,
    previousCount: count,
    newCount: count,
    capacity: city?.capacity ?? null,
    cityReopened: city ? city.is_open && count < city.capacity : false,
  };
}

async function audit(
  admin: AdminUser,
  leadId: string,
  field: "delete" | "restore" | "purge",
  reason: string,
  slot: SlotRelease,
) {
  // entity_id is uuid (city id). Lead IDs like CI_FTV_0002 are text — store
  // them in old_value. entity_type stays on the existing check constraint.
  try {
    await logConfigChange({
      actorId: admin.id,
      actorEmail: `${admin.email} (${admin.role})`,
      entityType: slot.cityId ? "city" : "study_config",
      entityId: slot.cityId,
      field: `respondent.${field}`,
      oldValue: leadId,
      newValue: JSON.stringify({
        reason,
        cityId: slot.cityId,
        cityName: slot.cityName,
        count: slot.newCount,
        previousCount: slot.previousCount,
        capacity: slot.capacity,
        cityReopened: slot.cityReopened,
      }),
    });
  } catch (error) {
    console.error("[respondent-delete] audit failed:", error);
  }
}

export async function softDeleteRespondent(input: {
  leadId: string;
  reason: string;
  admin: AdminUser;
}): Promise<SlotRelease> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new RespondentDeleteError(
      "reason_required",
      "A short delete reason is required.",
    );
  }

  const participant = await loadParticipantRow(input.leadId);
  if (!participant) {
    throw new RespondentDeleteError("not_found", "Respondent not found.", 404);
  }
  if (participant.deleted_at) {
    const cityId = participant.city_id ?? null;
    const screener = await loadScreenerRow(input.leadId);
    return measureSlot(screener?.city_id ?? cityId);
  }

  const screener = await loadScreenerRow(input.leadId);
  const cityId = screener?.city_id ?? participant.city_id ?? null;
  const before = await measureSlot(cityId);
  const payload = stamp(input.admin.id, reason);
  const admin = getSupabaseAdmin();

  const { error: screenerError } = await admin
    .from("screener_responses")
    .update(payload)
    .eq("lead_id", input.leadId)
    .is("deleted_at", null);
  if (screenerError) throw screenerError;

  const { error: ftvError } = await admin
    .from("ftv_responses")
    .update(payload)
    .eq("lead_id", input.leadId)
    .is("deleted_at", null);
  if (ftvError) throw ftvError;

  const { error: participantError } = await admin
    .from("participants")
    .update(payload)
    .eq("lead_id", input.leadId)
    .is("deleted_at", null);
  if (participantError) throw participantError;

  const after = await measureSlot(cityId);
  const city = await loadCity(cityId);
  const result: SlotRelease = {
    ...after,
    previousCount: before.newCount,
    cityReopened: Boolean(
      city && after.newCount < city.capacity && city.is_open,
    ),
  };
  await audit(input.admin, input.leadId, "delete", reason, result);
  return result;
}

export async function restoreRespondent(input: {
  leadId: string;
  reason: string;
  admin: AdminUser;
  confirmOverCapacity?: boolean;
}): Promise<SlotRelease> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new RespondentDeleteError(
      "reason_required",
      "A short restore reason is required.",
    );
  }

  const participant = await loadParticipantRow(input.leadId);
  if (!participant) {
    throw new RespondentDeleteError("not_found", "Respondent not found.", 404);
  }
  if (!participant.deleted_at) {
    throw new RespondentDeleteError(
      "not_deleted",
      "This respondent is not deleted.",
    );
  }

  const screener = await loadScreenerRow(input.leadId);
  const cityId = screener?.city_id ?? participant.city_id ?? null;
  const city = await loadCity(cityId);
  const before = await measureSlot(cityId);
  const restoringComplete = screener?.completion_status === "Completed";
  const nextCount = restoringComplete ? before.newCount + 1 : before.newCount;

  if (
    restoringComplete &&
    city &&
    nextCount > city.capacity &&
    !input.confirmOverCapacity
  ) {
    throw new RespondentDeleteError(
      "over_capacity",
      `Restoring this respondent would push ${city.name} over its limit (${nextCount}/${city.capacity}). Confirm to proceed.`,
      409,
      {
        cityId: city.id,
        cityName: city.name,
        currentCount: before.newCount,
        nextCount,
        capacity: city.capacity,
      },
    );
  }

  const clear = {
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  };
  const admin = getSupabaseAdmin();

  const { error: screenerError } = await admin
    .from("screener_responses")
    .update(clear)
    .eq("lead_id", input.leadId);
  if (screenerError) throw screenerError;

  const { error: ftvError } = await admin
    .from("ftv_responses")
    .update(clear)
    .eq("lead_id", input.leadId);
  if (ftvError) throw ftvError;

  const { error: participantError } = await admin
    .from("participants")
    .update(clear)
    .eq("lead_id", input.leadId);
  if (participantError) throw participantError;

  const after = await measureSlot(cityId);
  const result: SlotRelease = {
    ...after,
    previousCount: before.newCount,
    cityReopened: false,
  };
  await audit(input.admin, input.leadId, "restore", reason, result);
  return result;
}

export async function purgeRespondent(input: {
  leadId: string;
  confirmLeadId: string;
  reason: string;
  admin: AdminUser;
}): Promise<SlotRelease> {
  if (input.confirmLeadId.trim() !== input.leadId) {
    throw new RespondentDeleteError(
      "confirm_mismatch",
      "Type the respondent id exactly to purge.",
    );
  }
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new RespondentDeleteError(
      "reason_required",
      "A short purge reason is required.",
    );
  }

  const participant = await loadParticipantRow(input.leadId);
  if (!participant) {
    throw new RespondentDeleteError("not_found", "Respondent not found.", 404);
  }
  if (!participant.deleted_at) {
    throw new RespondentDeleteError(
      "not_deleted",
      "Soft-delete the respondent first, then purge from the Deleted view.",
    );
  }

  const screener = await loadScreenerRow(input.leadId);
  const cityId = screener?.city_id ?? participant.city_id ?? null;
  const before = await measureSlot(cityId);
  const admin = getSupabaseAdmin();

  const { error: ftvError } = await admin
    .from("ftv_responses")
    .delete()
    .eq("lead_id", input.leadId);
  if (ftvError) throw ftvError;

  const { error: screenerError } = await admin
    .from("screener_responses")
    .delete()
    .eq("lead_id", input.leadId);
  if (screenerError) throw screenerError;

  const { error: participantError } = await admin
    .from("participants")
    .delete()
    .eq("lead_id", input.leadId);
  if (participantError) throw participantError;

  const after = await measureSlot(cityId);
  const city = await loadCity(cityId);
  const result: SlotRelease = {
    ...after,
    previousCount: before.newCount,
    cityReopened: Boolean(
      city && after.newCount < city.capacity && city.is_open,
    ),
  };
  await audit(input.admin, input.leadId, "purge", reason, result);
  return result;
}

export async function listDeletedRespondents(
  limit = 200,
): Promise<DeletedRespondentRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select(
      "lead_id, full_name, mobile, city, status, deleted_at, deleted_by, delete_reason, created_at",
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data ?? [];
  const leadIds = rows.map((row) => row.lead_id);
  const screenerByLead = new Map<string, string | null>();
  if (leadIds.length > 0) {
    const { data: screeners, error: screenerError } = await getSupabaseAdmin()
      .from("screener_responses")
      .select("lead_id, completion_status")
      .in("lead_id", leadIds);
    if (screenerError) throw screenerError;
    for (const row of screeners ?? []) {
      screenerByLead.set(row.lead_id, row.completion_status);
    }
  }

  return rows.map((row) => ({
    leadId: row.lead_id,
    fullName: row.full_name || "Anonymous",
    mobile: row.mobile ?? "",
    city: row.city,
    status: row.status,
    deletedAt: row.deleted_at ?? "",
    deletedBy: row.deleted_by,
    deleteReason: row.delete_reason,
    screenerCompletionStatus: screenerByLead.get(row.lead_id) ?? null,
    createdAt: row.created_at,
  }));
}
