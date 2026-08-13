import { randomBytes } from "node:crypto";

import { getAppUrl } from "@/lib/app-url";

/** Cryptographically secure opaque token — never embeds lead_id. */
export function generateRefillToken(): string {
  return randomBytes(16).toString("hex");
}

export function buildRefillUrl(refillToken: string, baseUrl?: string): string {
  const origin = (baseUrl ?? getAppUrl()).replace(/\/$/, "");
  return `${origin}/refill?t=${encodeURIComponent(refillToken)}`;
}

export type RefillTokenValidation =
  | { valid: true; leadId: string; token: string }
  | { valid: false; reason: string };
