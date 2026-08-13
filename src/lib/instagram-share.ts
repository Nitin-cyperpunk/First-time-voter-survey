import { INSTAGRAM_DM_URL } from "@/config/social";
import { openInstagramDmUrl } from "@/lib/instagram";

export const INSTAGRAM_REFERRAL_COMPOSE_URL =
  "https://www.instagram.com/direct/new/";

export function buildInstagramShareUrl(
  message: string,
  dmUrl: string = INSTAGRAM_DM_URL,
): string {
  return `${dmUrl}?text=${encodeURIComponent(message)}`;
}

/** Opens the official Instagram DM inbox without prefilled text. */
export function openInstagramDmInbox(dmUrl: string = INSTAGRAM_DM_URL): void {
  openInstagramDmUrl(dmUrl);
}

/** Opens Instagram recipient picker for referral shares. */
export function openInstagramReferralComposer(
  composeUrl: string = INSTAGRAM_REFERRAL_COMPOSE_URL,
): void {
  openInstagramDmUrl(composeUrl);
}

/** Opens Instagram DM with a pre-filled message (referral share flow). */
export function openInstagramDm(
  message: string,
  dmUrl: string = INSTAGRAM_DM_URL,
): void {
  const trimmed = message.trim();
  if (!trimmed) return;

  openInstagramDmUrl(buildInstagramShareUrl(trimmed, dmUrl));
}
