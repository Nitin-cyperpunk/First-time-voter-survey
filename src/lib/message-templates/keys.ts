/** Keys referenced by application share flows (not shown as fixed UI options). */
export const MESSAGE_TEMPLATE_KEYS = {
  WHATSAPP_REFERRAL: "whatsapp_referral",
  INSTAGRAM_REFERRAL: "instagram_referral",
  NOT_ELIGIBLE_REFERRAL: "not_eligible_referral",
} as const;

export const REQUIRED_MESSAGE_TEMPLATE_KEYS = Object.values(
  MESSAGE_TEMPLATE_KEYS,
);

/** Old Enamor / verification-era templates — not used by FTV; hidden from admin list. */
export const LEGACY_MESSAGE_TEMPLATE_KEYS = [
  "instagram_verification",
  "whatsapp_verification",
  "survey_access",
  "enamor_referral",
  "apparel_referral",
] as const;
