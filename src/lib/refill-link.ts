import { getAppUrl } from "@/lib/app-url";

function resolveAppOrigin(baseUrl?: string): string {
  if (baseUrl?.trim()) {
    return baseUrl.trim().replace(/\/$/, "");
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  try {
    return getAppUrl();
  } catch {
    return "";
  }
}

/**
 * Absolute URL to a respondent's unique refill form.
 * Requires the opaque refill token (same pattern as /survey?t=...).
 * Without a token, returns a non-functional placeholder — callers must pass
 * the per-respondent token from Request Refill.
 */
export function buildRefillLink(refillToken?: string | null, baseUrl?: string): string {
  const origin = resolveAppOrigin(baseUrl);
  const token = refillToken?.trim();
  if (!token) {
    return origin ? `${origin}/refill/invalid` : "/refill/invalid";
  }
  const path = `/refill?t=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}
