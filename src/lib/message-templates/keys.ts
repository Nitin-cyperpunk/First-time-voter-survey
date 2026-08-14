/** Keys referenced by application share flows (not shown as fixed UI options). */
export const MESSAGE_TEMPLATE_KEYS = {
  WHATSAPP_REFERRAL: "whatsapp_referral",
  INSTAGRAM_REFERRAL: "instagram_referral",
  NOT_ELIGIBLE_REFERRAL: "not_eligible_referral",
  WHATSAPP_SUBMISSION_CONFIRMATION: "whatsapp_submission_confirmation",
} as const;

export const REQUIRED_MESSAGE_TEMPLATE_KEYS = [
  MESSAGE_TEMPLATE_KEYS.WHATSAPP_REFERRAL,
  MESSAGE_TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
  MESSAGE_TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL,
] as const;

/** Keys that may already exist in Supabase from a custom admin template. */
export const WHATSAPP_SUBMISSION_CONFIRMATION_ALIASES = [
  "whatsapp_submission_confirmation",
  "submission_confirmation",
  "submission_confirm",
  "whatsapp_verification",
] as const;

export function resolveWhatsAppSubmissionConfirmationKey(
  templates: Record<
    string,
    { title?: string; channel?: string; enabled?: boolean; template?: string }
  >,
): string {
  for (const key of WHATSAPP_SUBMISSION_CONFIRMATION_ALIASES) {
    const entry = templates[key];
    if (entry?.enabled !== false && entry?.template?.trim()) return key;
  }

  for (const [key, entry] of Object.entries(templates)) {
    const title = String(entry?.title ?? "").toLowerCase();
    if (
      entry?.enabled !== false &&
      entry?.channel === "whatsapp" &&
      entry?.template?.trim() &&
      /submission\s*confirm/.test(title)
    ) {
      return key;
    }
  }

  return MESSAGE_TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION;
}

/** Old Enamor / verification-era templates — not used by FTV; hidden from admin list. */
export const LEGACY_MESSAGE_TEMPLATE_KEYS = [
  "instagram_verification",
  "whatsapp_verification",
  "survey_access",
  "enamor_referral",
  "apparel_referral",
] as const;
