import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (typeof error !== "object" || error === null) return false;

  const code = "code" in error ? error.code : null;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return (
    (code === "42703" || code === "PGRST204") && message.includes(columnName)
  );
}

export async function createSession(input: {
  leadId: string;
  token: string;
  rememberMe?: boolean;
  expiresAt: Date;
}) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("participant_sessions")
    .insert({
      lead_id: input.leadId,
      token_hash: hashSessionToken(input.token),
      remember_me: input.rememberMe ?? false,
      expires_at: input.expiresAt.toISOString(),
      last_seen_at: now,
    })
    .select("*")
    .single();

  if (isMissingColumnError(error, "last_seen_at")) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("participant_sessions")
      .insert({
        lead_id: input.leadId,
        token_hash: hashSessionToken(input.token),
        remember_me: input.rememberMe ?? false,
        expires_at: input.expiresAt.toISOString(),
      })
      .select("*")
      .single();

    if (legacyError) throw legacyError;
    return legacyData;
  }

  if (error) throw error;
  return data;
}

/**
 * Returns the session only when it exists, is not expired, and is not revoked.
 * Also refreshes last_seen_at for activity tracking (does NOT extend expiry).
 */
export async function validateSession(token: string) {
  const tokenHash = hashSessionToken(token);

  const { data, error } = await getSupabaseAdmin()
    .from("participant_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();

  if (isMissingColumnError(error, "revoked_at")) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("participant_sessions")
      .select("*")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (legacyError) throw legacyError;
    return legacyData;
  }

  if (error) throw error;
  if (!data) return null;

  // Fire-and-forget activity touch; never blocks auth on failure.
  void getSupabaseAdmin()
    .from("participant_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .then(({ error: touchError }) => {
      if (touchError) {
        console.error("Failed to touch session last_seen_at:", touchError);
      }
    });

  return data;
}

/** Returns the raw session row for a token, regardless of expiry/revocation. */
export async function findSessionByToken(token: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("participant_sessions")
    .select("lead_id")
    .eq("token_hash", hashSessionToken(token))
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Revokes a single session (used by logout). Keeps the row for audit. */
export async function revokeSession(token: string) {
  const { error } = await getSupabaseAdmin()
    .from("participant_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashSessionToken(token))
    .is("revoked_at", null);

  if (isMissingColumnError(error, "revoked_at")) {
    await deleteSession(token);
    return;
  }

  if (error) throw error;
}

export async function deleteSession(token: string) {
  const { error } = await getSupabaseAdmin()
    .from("participant_sessions")
    .delete()
    .eq("token_hash", hashSessionToken(token));

  if (error) throw error;
}

/** Revokes all other active sessions for a participant to avoid stale duplicates. */
export async function revokeActiveSessionsForLead(leadId: string) {
  const { error } = await getSupabaseAdmin()
    .from("participant_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .is("revoked_at", null);

  if (isMissingColumnError(error, "revoked_at")) {
    const { error: deleteError } = await getSupabaseAdmin()
      .from("participant_sessions")
      .delete()
      .eq("lead_id", leadId);

    if (deleteError) throw deleteError;
    return;
  }

  if (error) throw error;
}
