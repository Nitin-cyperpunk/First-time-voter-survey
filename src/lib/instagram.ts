import { copyTextToClipboard } from "@/lib/instagram-clipboard";
import { toastSuccess } from "@/lib/toast";

const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const LOOKS_LIKE_INSTAGRAM_URL =
  /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|ig\.me)\//i;

export const INSTAGRAM_DIRECT_INBOX_URL =
  "https://www.instagram.com/direct/inbox/";

/** Ignore duplicate opens from double-clicks / double handlers. */
const OPEN_DEBOUNCE_MS = 2000;
let lastOpenedUrl = "";
let lastOpenedAt = 0;

export type NormalizeInstagramResult =
  | { ok: true; username: string }
  | { ok: false; error: string };

export type RunInstagramSendResult =
  | { status: "missing_username" }
  | { status: "invalid_username"; error: string }
  | { status: "sent"; username: string; dmUrl: string };

export type RunInstagramSendInput = {
  message: string;
  instagramId?: string | null;
  onCopied?: () => void;
  updateDmStatus?: () => void | Promise<void>;
};

/** Trim, strip @, reject URLs/spaces/invalid chars. Usernames only — no URL parsing. */
export function normalizeInstagramId(raw: string): NormalizeInstagramResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Instagram username is required." };
  }

  if (LOOKS_LIKE_INSTAGRAM_URL.test(trimmed)) {
    return {
      ok: false,
      error: "Enter the username only, not an Instagram URL.",
    };
  }

  let candidate = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  if (/\s/.test(candidate)) {
    return { ok: false, error: "Instagram username cannot contain spaces." };
  }

  candidate = candidate.replace(/\/+$/, "");

  if (!INSTAGRAM_USERNAME_PATTERN.test(candidate)) {
    return {
      ok: false,
      error:
        "Use 1–30 characters: letters, numbers, periods, and underscores only.",
    };
  }

  return { ok: true, username: candidate.toLowerCase() };
}

export function validateInstagramId(raw: string): NormalizeInstagramResult {
  return normalizeInstagramId(raw);
}

export function igMeLink(username: string): string {
  const normalized = normalizeInstagramId(username);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }
  return `https://ig.me/m/${normalized.username}`;
}

/** Opens a DM thread with the participant (not their profile). */
export function participantInstagramDmUrl(username: string): string {
  return igMeLink(username);
}

export function openParticipantInstagramDm(username: string): void {
  openInstagramDmUrl(participantInstagramDmUrl(username));
}

/**
 * Open Instagram in exactly one new tab. Never navigates the current admin page.
 *
 * Avoid window.open + location.assign: with "noopener", window.open often returns
 * null even when a tab opened, and location.assign then turns the admin tab into
 * a second Instagram tab.
 */
export function openInstagramDmUrl(url: string): void {
  if (typeof document === "undefined") return;

  const now = Date.now();
  if (url === lastOpenedUrl && now - lastOpenedAt < OPEN_DEBOUNCE_MS) {
    return;
  }
  lastOpenedUrl = url;
  lastOpenedAt = now;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function openInstagramDirectInbox(): void {
  openInstagramDmUrl(INSTAGRAM_DIRECT_INBOX_URL);
}

export type InstagramVisibility = "public" | "private";

export type SanitizeInstagramHandleResult =
  | { ok: true; handle: string }
  | { ok: false; error: string };

/**
 * Sanitize a handle for private-profile URLs only.
 * Preserves case; strips @ / pasted instagram.com URLs. Does not touch the public DM path.
 */
export function sanitizeInstagramHandleForProfile(
  raw: string,
): SanitizeInstagramHandleResult {
  let candidate = raw.trim();
  if (!candidate) {
    return { ok: false, error: "Instagram username is required." };
  }

  const urlMatch = candidate.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?/i,
  );
  if (urlMatch?.[1]) {
    candidate = urlMatch[1];
  } else if (LOOKS_LIKE_INSTAGRAM_URL.test(candidate)) {
    return {
      ok: false,
      error: "Enter the username only, not an Instagram URL.",
    };
  }

  if (candidate.startsWith("@")) {
    candidate = candidate.slice(1);
  }

  candidate = candidate.replace(/\/+$/, "").trim();

  if (/\s/.test(candidate)) {
    return { ok: false, error: "Instagram username cannot contain spaces." };
  }

  if (!INSTAGRAM_USERNAME_PATTERN.test(candidate)) {
    return {
      ok: false,
      error:
        "Use 1–30 characters: letters, numbers, periods, and underscores only.",
    };
  }

  return { ok: true, handle: candidate };
}

/** Private accounts: open the user's Instagram profile (not ig.me DM). */
export function buildInstagramProfileUrl(handle: string): string {
  const sanitized = sanitizeInstagramHandleForProfile(handle);
  if (!sanitized.ok) {
    throw new Error(sanitized.error);
  }
  return `https://www.instagram.com/${sanitized.handle}`;
}

export function openInstagramProfile(handle: string): void {
  const url = buildInstagramProfileUrl(handle);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function persistParticipantInstagramVisibility(
  leadId: string,
  visibility: InstagramVisibility,
): Promise<InstagramVisibility> {
  const response = await fetch(
    `/api/admin/participants/${encodeURIComponent(leadId)}/instagram-id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagramVisibility: visibility }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Failed to save Instagram visibility.",
    );
  }
  return payload.instagramVisibility === "private" ? "private" : "public";
}

/** Persist normalized username (or clear) via existing admin participant API. */
export async function persistParticipantInstagramId(
  leadId: string,
  instagramId: string | null,
): Promise<string | null> {
  const response = await fetch(
    `/api/admin/participants/${encodeURIComponent(leadId)}/instagram-id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagramId }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Failed to save Instagram ID.",
    );
  }
  return (payload.instagramId as string | null) ?? null;
}

/**
 * Resolve draft/saved username, persist pending edits, return normalized username.
 */
export async function resolveAndPersistInstagramId(
  leadId: string,
  input: { draft: string; saved: string | null },
): Promise<NormalizeInstagramResult> {
  const draft = input.draft.trim();
  const saved = (input.saved ?? "").trim();
  const raw = draft || saved;

  if (!raw) {
    return { ok: false, error: "Instagram username is required." };
  }

  const normalized = normalizeInstagramId(raw);
  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.username !== saved) {
    const persisted = await persistParticipantInstagramId(
      leadId,
      normalized.username,
    );
    return { ok: true, username: persisted ?? normalized.username };
  }

  return normalized;
}

/**
 * Admin send flow: open DM first (sync, in the click gesture), then copy + status.
 */
export async function runInstagramSend(
  input: RunInstagramSendInput,
): Promise<RunInstagramSendResult> {
  const message = input.message.trim();
  const rawId = input.instagramId?.trim() ?? "";

  if (!rawId) {
    return { status: "missing_username" };
  }

  const normalized = normalizeInstagramId(rawId);
  if (!normalized.ok) {
    return { status: "invalid_username", error: normalized.error };
  }

  const dmUrl = participantInstagramDmUrl(normalized.username);
  // Open before any await so the browser keeps this in the user-gesture chain.
  openInstagramDmUrl(dmUrl);

  const copied = await copyTextToClipboard(message);
  if (copied) {
    input.onCopied?.();
    toastSuccess("Message copied successfully.");
  }

  if (input.updateDmStatus) {
    await input.updateDmStatus();
  }

  return { status: "sent", username: normalized.username, dmUrl };
}

/** Reuses PATCH /api/admin/dm-verify `mark_message_received` — no duplicate status logic. */
export function createMarkMessageReceivedHandler(
  leadId: string,
): () => Promise<void> {
  return async () => {
    const response = await fetch("/api/admin/dm-verify", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        action: "mark_message_received",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "Failed to update DM status.",
      );
    }
  };
}
