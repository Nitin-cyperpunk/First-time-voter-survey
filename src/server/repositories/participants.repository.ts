import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { Participant } from "@/types/domain";

type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];
type ParticipantInsert = Database["public"]["Tables"]["participants"]["Insert"];

export type ParticipantCreateInput = {
  referralCode: string;
  fullName: string | null;
  mobile?: string | null;
  dob?: string | null;
  ageBand?: string | null;
  city: string;
  cityId?: string | null;
  cityRaw?: string | null;
  cityMatchType?: "exact" | "alias" | "unmatched" | null;
  email?: string | null;
  area?: string | null;
  pincode?: string | null;
  referredBy?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  isFlaggedDuplicate?: boolean;
  acquisitionSource?: string | null;
  acquisitionType?: string | null;
  referralPlatform?: string | null;
  otherSource?: string | null;
  deviceFingerprint?: string | null;
  status?: string;
};

export function mapParticipant(row: ParticipantRow): Participant {
  return {
    leadId: row.lead_id,
    referralCode: row.referral_code,
    fullName: row.full_name || "Anonymous",
    mobile: row.mobile ?? "",
    dob: row.dob ?? "",
    city: row.city,
    cityId: row.city_id ?? null,
    email: row.email ?? null,
    area: row.area ?? null,
    pincode: row.pincode ?? null,
    status: row.status,
    referredBy: row.referred_by,
    ipAddress: row.ip_address ?? null,
    isFlaggedDuplicate: row.is_flagged_duplicate,
    upiId: row.upi_id ?? null,
    upiSubmittedAt: row.upi_submitted_at
      ? new Date(row.upi_submitted_at)
      : null,
    acquisitionSource: row.acquisition_source ?? null,
    acquisitionType: row.acquisition_type ?? null,
    referralPlatform: row.referral_platform ?? null,
    otherSource: row.other_source ?? null,
    deviceFingerprint: row.device_fingerprint ?? null,
    duplicateFlag: row.duplicate_flag ?? false,
    duplicateReason: row.duplicate_reason ?? null,
    duplicateDetectedAt: row.duplicate_detected_at
      ? new Date(row.duplicate_detected_at)
      : null,
    reviewStatus: row.review_status ?? "Pending",
    originalParticipantLeadId: row.original_participant_lead_id ?? null,
    duplicateClusterId: (row as Record<string, unknown>).duplicate_cluster_id as string | null ?? null,
    isFingerprintClusterOriginal: Boolean((row as Record<string, unknown>).is_fingerprint_cluster_original),
    duplicateGamingPattern: (row as Record<string, unknown>).duplicate_gaming_pattern as string | null ?? null,
    qcStatusOverride: normalizeQcOverride(
      (row as Record<string, unknown>).qc_status_override,
    ),
    surveyDataIncomplete:
      (row as Record<string, unknown>).survey_data_incomplete === true,
    createdAt: new Date(row.created_at),
  };
}

function normalizeQcOverride(value: unknown): "pass" | "fail" | "review" | null {
  if (value === "pass" || value === "fail" || value === "review") return value;
  return null;
}

function toInsert(input: ParticipantCreateInput): ParticipantInsert {
  return {
    referral_code: input.referralCode,
    full_name: input.fullName?.trim() || null,
    mobile: input.mobile?.trim() || null,
    dob: input.dob?.trim() || null,
    age_band: input.ageBand?.trim() || null,
    city: input.city.trim(),
    ...(input.cityId !== undefined ? { city_id: input.cityId } : {}),
    ...(input.cityRaw !== undefined
      ? { city_raw: input.cityRaw?.trim() || null }
      : {}),
    ...(input.cityMatchType !== undefined
      ? { city_match_type: input.cityMatchType }
      : {}),
    ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
    ...(input.area !== undefined ? { area: input.area?.trim() || null } : {}),
    ...(input.pincode !== undefined
      ? { pincode: input.pincode?.trim() || null }
      : {}),
    status: input.status ?? "completed",
    referred_by: input.referredBy ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    is_flagged_duplicate: input.isFlaggedDuplicate ?? false,
    acquisition_source: input.acquisitionSource ?? null,
    acquisition_type: input.acquisitionType ?? null,
    referral_platform: input.referralPlatform ?? null,
    other_source: input.otherSource ?? null,
    device_fingerprint: input.deviceFingerprint ?? null,
  };
}

export async function findByReferralCode(referralCode: string) {
  const normalized = referralCode.trim().toUpperCase();
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("referral_code", normalized)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function deleteParticipantByLeadId(leadId: string) {
  try {
    await getSupabaseAdmin()
      .from("fingerprint_events")
      .delete()
      .eq("participant_lead_id", leadId);
  } catch {
    // Fingerprint rows may not exist yet; continue with participant delete.
  }

  const { error } = await getSupabaseAdmin()
    .from("participants")
    .delete()
    .eq("lead_id", leadId);

  if (error) throw error;
}

export async function findByMobile(mobile: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("mobile", mobile.trim())
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function findByMobileAndDob(mobile: string, dob: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("mobile", mobile.trim())
    .eq("dob", dob)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function findParticipantByLeadId(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function getParticipantIpAddress(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("ip_address")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) throw error;
  return data?.ip_address ?? null;
}

export async function createParticipant(input: ParticipantCreateInput) {
  const insertPayload = toInsert(input);

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;
  return mapParticipant(data);
}

/** @internal Use lifecycle.service.transitionParticipantStatus instead. */
export async function updateParticipantStatus(leadId: string, status: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update({ status })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

/** @internal Use lifecycle.service.transitionParticipantStatus instead. */
export async function recordParticipantStatusHistory(
  leadId: string,
  status: string,
  options?: {
    oldStatus?: string;
    changedBy?: string;
    notes?: string;
  },
) {
  const { error } = await getSupabaseAdmin()
    .from("status_history")
    .insert({
      lead_id: leadId,
      status,
      new_status: status,
      old_status: options?.oldStatus ?? null,
      changed_by: options?.changedBy ?? "system",
      notes: options?.notes ?? null,
    });

  if (error) throw error;
}

export async function searchParticipants(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const escaped = trimmed.replace(/[%_]/g, "\\$&");
  const pattern = `%${escaped}%`;

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .is("deleted_at", null)
    .or(
      [
        `lead_id.ilike.${pattern}`,
        `mobile.ilike.${pattern}`,
        `full_name.ilike.${pattern}`,
        `referral_code.ilike.${pattern}`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []).map(mapParticipant);
}

export async function countParticipantsByIp(ipAddress: string) {
  const { count, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .is("deleted_at", null);

  if (error) throw error;
  return count ?? 0;
}

export async function hasParticipantWithIp(ipAddress: string) {
  return (await countParticipantsByIp(ipAddress)) > 0;
}

export async function updateParticipantDuplicateFlag(
  leadId: string,
  isFlaggedDuplicate: boolean,
) {
  const { error } = await getSupabaseAdmin()
    .from("participants")
    .update({ is_flagged_duplicate: isFlaggedDuplicate })
    .eq("lead_id", leadId);

  if (error) throw error;
}

/** Flag or clear is_flagged_duplicate for every participant on this IP. */
export async function updateIpDuplicateFlagsForAddress(
  ipAddress: string,
  isFlaggedDuplicate: boolean,
) {
  const { error } = await getSupabaseAdmin()
    .from("participants")
    .update({ is_flagged_duplicate: isFlaggedDuplicate })
    .eq("ip_address", ipAddress)
    .is("deleted_at", null);

  if (error) throw error;
}

export async function updateParticipantProfile(
  leadId: string,
  input: {
    fullName: string;
    city: string;
    cityId?: string | null;
    dob?: string;
    email?: string | null;
    area?: string | null;
    pincode?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceFingerprint?: string | null;
  },
) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update({
      full_name: input.fullName.trim(),
      city: input.city.trim(),
      ...(input.cityId !== undefined ? { city_id: input.cityId } : {}),
      ...(input.dob ? { dob: input.dob } : {}),
      ...(input.email !== undefined
        ? { email: input.email?.trim() || null }
        : {}),
      ...(input.area !== undefined ? { area: input.area?.trim() || null } : {}),
      ...(input.pincode !== undefined
        ? { pincode: input.pincode?.trim() || null }
        : {}),
      ...(input.ipAddress !== undefined ? { ip_address: input.ipAddress } : {}),
      ...(input.userAgent !== undefined ? { user_agent: input.userAgent } : {}),
      ...(input.deviceFingerprint !== undefined
        ? { device_fingerprint: input.deviceFingerprint }
        : {}),
    })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function updateParticipantBasicContact(
  leadId: string,
  input: {
    email?: string | null;
    area?: string | null;
    pincode?: string | null;
  },
) {
  const payload: Partial<ParticipantInsert> = {};
  if (input.email !== undefined) {
    payload.email = input.email?.trim() || null;
  }
  if (input.area !== undefined) {
    payload.area = input.area?.trim() || null;
  }
  if (input.pincode !== undefined) {
    payload.pincode = input.pincode?.trim() || null;
  }

  if (Object.keys(payload).length === 0) {
    return findParticipantByLeadId(leadId);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update(payload)
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return findParticipantByLeadId(leadId);
    }
    throw error;
  }

  return data ? mapParticipant(data) : null;
}

export async function updateParticipantUpi(
  leadId: string,
  upiId: string | null,
) {
  const payload = {
    upi_id: upiId,
    upi_submitted_at: upiId ? new Date().toISOString() : null,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update(payload)
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    // Backward-compatible while migration 021 / PostgREST schema cache catches
    // up. The UPI ID is the critical field; upi_submitted_at is added by 021.
    if (error.code !== "PGRST204") throw error;

    const fallback = await getSupabaseAdmin()
      .from("participants")
      .update({ upi_id: upiId })
      .eq("lead_id", leadId)
      .select("*")
      .maybeSingle();

    if (fallback.error) throw fallback.error;
    return fallback.data ? mapParticipant(fallback.data) : null;
  }

  return data ? mapParticipant(data) : null;
}

/**
 * Patch a participant's full_name and/or mobile from an external source
 * (e.g. ftv_respondents_all) when the registration write left them blank.
 * Only updates fields that are currently blank/Anonymous on the row.
 */
export async function patchParticipantNameMobile(
  leadId: string,
  source: { name: string | null; phone: string | null },
): Promise<void> {
  const { data: current, error: fetchErr } = await getSupabaseAdmin()
    .from("participants")
    .select("full_name,mobile")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (fetchErr || !current) return;

  const patch: Partial<ParticipantInsert> = {};
  const isBlankName =
    !current.full_name ||
    current.full_name === "Anonymous" ||
    current.full_name.trim() === "";
  if (isBlankName && source.name?.trim()) {
    patch.full_name = source.name.trim();
  }
  if (!current.mobile && source.phone?.trim()) {
    patch.mobile = source.phone.trim();
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await getSupabaseAdmin()
    .from("participants")
    .update(patch)
    .eq("lead_id", leadId);

  if (error) {
    console.error(
      `[patchParticipantNameMobile] failed to patch ${leadId}:`,
      error,
    );
  }
}
