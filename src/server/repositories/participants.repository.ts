import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { Participant } from "@/types/domain";

type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];
type ParticipantInsert = Database["public"]["Tables"]["participants"]["Insert"];

export type ParticipantCreateInput = {
  referralCode: string;
  fullName: string;
  mobile: string;
  dob: string;
  city: string;
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
};

export function mapParticipant(row: ParticipantRow): Participant {
  return {
    leadId: row.lead_id,
    referralCode: row.referral_code,
    fullName: row.full_name,
    mobile: row.mobile,
    dob: row.dob,
    city: row.city,
    email: row.email ?? null,
    area: row.area ?? null,
    pincode: row.pincode ?? null,
    status: row.status,
    referredBy: row.referred_by,
    ipAddress: row.ip_address ?? null,
    isFlaggedDuplicate: row.is_flagged_duplicate,
    refillRequired: row.refill_required ?? false,
    refillReason: row.refill_reason ?? null,
    refillRequestedAt: row.refill_requested_at
      ? new Date(row.refill_requested_at)
      : null,
    refillCompletedAt: row.refill_completed_at
      ? new Date(row.refill_completed_at)
      : null,
    refillToken: row.refill_token ?? null,
    eligibilityManualOverride: row.eligibility_manual_override ?? false,
    eligibilityOverrideReason: row.eligibility_override_reason ?? null,
    eligibilityOverriddenAt: row.eligibility_overridden_at
      ? new Date(row.eligibility_overridden_at)
      : null,
    upiId: row.upi_id ?? null,
    upiSubmittedAt: row.upi_submitted_at
      ? new Date(row.upi_submitted_at)
      : null,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    verificationMethod: row.verification_method ?? null,
    acquisitionSource: row.acquisition_source ?? null,
    acquisitionType: row.acquisition_type ?? null,
    referralPlatform: row.referral_platform ?? null,
    otherSource: row.other_source ?? null,
    dmStatus: row.dm_status ?? null,
    instagramId: row.instagram_id ?? null,
    instagramVisibility:
      row.instagram_visibility === "private" ? "private" : "public",
    callDisposition: row.call_disposition ?? null,
    callDispositionNotes: row.call_disposition_notes ?? null,
    callDispositionAt: row.call_disposition_at
      ? new Date(row.call_disposition_at)
      : null,
    deviceFingerprint: row.device_fingerprint ?? null,
    duplicateFlag: row.duplicate_flag ?? false,
    duplicateReason: row.duplicate_reason ?? null,
    duplicateDetectedAt: row.duplicate_detected_at
      ? new Date(row.duplicate_detected_at)
      : null,
    reviewStatus: row.review_status ?? "Pending",
    originalParticipantLeadId: row.original_participant_lead_id ?? null,
    createdAt: new Date(row.created_at),
  };
}

function toInsert(input: ParticipantCreateInput): ParticipantInsert {
  return {
    referral_code: input.referralCode,
    full_name: input.fullName.trim(),
    mobile: input.mobile.trim(),
    dob: input.dob,
    city: input.city.trim(),
    ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
    ...(input.area !== undefined ? { area: input.area?.trim() || null } : {}),
    ...(input.pincode !== undefined
      ? { pincode: input.pincode?.trim() || null }
      : {}),
    status: "under_review",
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
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function findByRefillToken(refillToken: string) {
  const normalized = refillToken.trim();
  if (!normalized) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("refill_token", normalized)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return null;
    }
    throw error;
  }
  return data ? mapParticipant(data) : null;
}

export async function refillTokenExists(refillToken: string) {
  const normalized = refillToken.trim();
  if (!normalized) return false;

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("lead_id")
    .eq("refill_token", normalized)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return false;
    }
    throw error;
  }
  return Boolean(data);
}

export async function findByMobile(mobile: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("mobile", mobile.trim())
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
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function findParticipantByLeadId(leadId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .eq("lead_id", leadId)
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

  if (!error) return mapParticipant(data);

  // Migration 023 adds under_review to participants_status_check. Until applied,
  // fall back to lead so registration still succeeds.
  if (
    insertPayload.status === "under_review" &&
    (error.code === "23514" ||
      error.message?.includes("participants_status_check"))
  ) {
    const fallback = await getSupabaseAdmin()
      .from("participants")
      .insert({ ...insertPayload, status: "lead" })
      .select("*")
      .single();

    if (fallback.error) throw fallback.error;
    return mapParticipant(fallback.data);
  }

  // Migration 019 acquisition columns — retry without them if not yet applied.
  if (error.code === "42703" || error.code === "PGRST204") {
    const {
      acquisition_source: _as,
      acquisition_type: _at,
      referral_platform: _rp,
      other_source: _os,
      ...withoutAcquisition
    } = insertPayload;

    const fallback = await getSupabaseAdmin()
      .from("participants")
      .insert(withoutAcquisition)
      .select("*")
      .single();

    if (fallback.error) {
      if (
        withoutAcquisition.status === "under_review" &&
        (fallback.error.code === "23514" ||
          fallback.error.message?.includes("participants_status_check"))
      ) {
        const statusFallback = await getSupabaseAdmin()
          .from("participants")
          .insert({ ...withoutAcquisition, status: "lead" })
          .select("*")
          .single();

        if (statusFallback.error) throw statusFallback.error;
        return mapParticipant(statusFallback.data);
      }
      throw fallback.error;
    }
    return mapParticipant(fallback.data);
  }

  throw error;
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
  const instagramQuery = trimmed.replace(/^@/, "");
  const instagramPattern = `%${instagramQuery.replace(/[%_]/g, "\\$&")}%`;

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select("*")
    .or(
      [
        `lead_id.ilike.${pattern}`,
        `mobile.ilike.${pattern}`,
        `full_name.ilike.${pattern}`,
        `referral_code.ilike.${pattern}`,
        `instagram_id.ilike.${instagramPattern}`,
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
    .eq("ip_address", ipAddress);

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

export async function updateParticipantProfile(
  leadId: string,
  input: {
    fullName: string;
    city: string;
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

export async function setRefillRequest(
  leadId: string,
  reason: string,
  refillToken: string,
) {
  const payload = {
    refill_required: true,
    refill_reason: reason.trim(),
    refill_requested_at: new Date().toISOString(),
    refill_completed_at: null as string | null,
    refill_token: refillToken.trim(),
  };

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update(payload)
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      const { refill_token: _rt, ...withoutToken } = payload;
      const fallback = await getSupabaseAdmin()
        .from("participants")
        .update(withoutToken)
        .eq("lead_id", leadId)
        .select("*")
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return fallback.data ? mapParticipant(fallback.data) : null;
    }
    throw error;
  }
  return data ? mapParticipant(data) : null;
}

export async function clearRefillRequest(leadId: string) {
  const payload = {
    refill_required: false,
    // Keep refill_reason for admin audit; only clear the active flag.
    refill_completed_at: new Date().toISOString(),
    refill_token: null as string | null,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update(payload)
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      const { refill_token: _rt, ...withoutToken } = payload;
      const fallback = await getSupabaseAdmin()
        .from("participants")
        .update(withoutToken)
        .eq("lead_id", leadId)
        .select("*")
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return fallback.data ? mapParticipant(fallback.data) : null;
    }
    throw error;
  }
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

export async function updateParticipantCallDisposition(
  leadId: string,
  input: {
    dispositionKey: string;
    notes: string | null;
    status?: string;
    dmStatus?: string;
    verifiedAt?: Date;
    verificationMethod?: string;
  },
) {
  const payload: Partial<
    Database["public"]["Tables"]["participants"]["Insert"]
  > = {
    call_disposition: input.dispositionKey,
    call_disposition_notes: input.notes,
    call_disposition_at: new Date().toISOString(),
  };

  if (input.status) payload.status = input.status;
  if (input.dmStatus) payload.dm_status = input.dmStatus;
  if (input.verifiedAt) payload.verified_at = input.verifiedAt.toISOString();
  if (input.verificationMethod) {
    payload.verification_method = input.verificationMethod;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update(payload)
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      const {
        call_disposition: _cd,
        call_disposition_notes: _cdn,
        call_disposition_at: _cda,
        dm_status: _dm,
        ...withoutDisposition
      } = payload;
      if (Object.keys(withoutDisposition).length === 0) {
        return findParticipantByLeadId(leadId);
      }
      const fallback = await getSupabaseAdmin()
        .from("participants")
        .update(withoutDisposition)
        .eq("lead_id", leadId)
        .select("*")
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return fallback.data ? mapParticipant(fallback.data) : null;
    }
    throw error;
  }

  return data ? mapParticipant(data) : null;
}

export async function updateParticipantDmStatus(
  leadId: string,
  dmStatus: string,
  extra?: {
    verifiedAt?: Date;
    verificationMethod?: string;
  },
) {
  const payload: Partial<
    Database["public"]["Tables"]["participants"]["Insert"]
  > = {
    dm_status: dmStatus,
  };
  if (extra?.verifiedAt) {
    payload.verified_at = extra.verifiedAt.toISOString();
  }
  if (extra?.verificationMethod) {
    payload.verification_method = extra.verificationMethod;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update(payload)
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      const { dm_status: _dm, ...withoutDm } = payload;
      if (Object.keys(withoutDm).length === 0) {
        return findParticipantByLeadId(leadId);
      }
      const fallback = await getSupabaseAdmin()
        .from("participants")
        .update(withoutDm)
        .eq("lead_id", leadId)
        .select("*")
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return fallback.data ? mapParticipant(fallback.data) : null;
    }
    throw error;
  }

  return data ? mapParticipant(data) : null;
}

export async function setAdminEligibilityOverride(
  leadId: string,
  input: { reason: string | null },
) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update({
      eligibility_manual_override: true,
      eligibility_override_reason: input.reason?.trim() || null,
      eligibility_overridden_at: new Date().toISOString(),
    })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
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

export async function updateParticipantInstagramId(
  leadId: string,
  instagramId: string | null,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update({ instagram_id: instagramId })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}

export async function updateParticipantInstagramVisibility(
  leadId: string,
  visibility: "public" | "private",
) {
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .update({ instagram_visibility: visibility })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapParticipant(data) : null;
}
