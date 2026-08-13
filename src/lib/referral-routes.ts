import { NextResponse } from "next/server";

import { normalizeReferralPlatform } from "@/lib/acquisition";
import {
  isValidReferralCodeFormat,
  normalizeReferralCode,
  type ReferralPlatform,
} from "@/lib/referral-code";
import {
  REFERRAL_CODE_STORAGE_KEY,
  REFERRAL_PLATFORM_STORAGE_KEY,
} from "@/lib/referral-attribution";

const PLATFORM_PATH_SEGMENTS: Record<string, ReferralPlatform> = {
  w: "whatsapp",
  i: "instagram",
  c: "copy",
};

export function parseReferralPlatformPathSegment(
  segment: string,
): ReferralPlatform | null {
  return PLATFORM_PATH_SEGMENTS[segment.toLowerCase()] ?? null;
}

export function isReferralPlatformPathSegment(segment: string): boolean {
  return segment.toLowerCase() in PLATFORM_PATH_SEGMENTS;
}

function escapeForInlineScript(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/</g, "\\u003c");
}

export function buildReferralAttributionRedirectResponse(
  referralCode: string,
  platform?: ReferralPlatform | null,
) {
  const normalized = normalizeReferralCode(referralCode);
  const codeLiteral = escapeForInlineScript(normalized);
  const platformLiteral = platform
    ? escapeForInlineScript(platform)
    : null;

  const script = platformLiteral
    ? `sessionStorage.setItem('${REFERRAL_CODE_STORAGE_KEY}','${codeLiteral}');sessionStorage.setItem('${REFERRAL_PLATFORM_STORAGE_KEY}','${platformLiteral}');window.location.replace('/');`
    : `sessionStorage.setItem('${REFERRAL_CODE_STORAGE_KEY}','${codeLiteral}');sessionStorage.removeItem('${REFERRAL_PLATFORM_STORAGE_KEY}');window.location.replace('/');`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting…</title><script>${script}</script></head><body><p>Redirecting…</p></body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function referralAttributionNotFoundResponse() {
  return new NextResponse(
    `<!doctype html><html><body><p>This referral link is invalid.</p><p><a href="/">Continue to registration</a></p></body></html>`,
    {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export function resolveLegacyReferralRedirect(
  ref: string | null,
  platform: string | null,
  origin: string,
): NextResponse | null {
  if (!ref?.trim()) return null;

  const normalized = normalizeReferralCode(ref);
  if (!isValidReferralCodeFormat(normalized)) return null;

  const parsedPlatform = normalizeReferralPlatform(platform);
  const path = parsedPlatform
    ? `/r/${platformPathSegment(parsedPlatform)}/${normalized}`
    : `/r/${normalized}`;

  return NextResponse.redirect(new URL(path, origin));
}

function platformPathSegment(platform: ReferralPlatform): string {
  switch (platform) {
    case "whatsapp":
      return "w";
    case "instagram":
      return "i";
    case "copy":
      return "c";
  }
}
