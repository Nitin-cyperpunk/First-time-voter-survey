/** Keys referenced by application share flows (not shown as fixed UI options). */
export const MESSAGE_TEMPLATE_KEYS = {
  WHATSAPP_REFERRAL: "whatsapp_referral",
  INSTAGRAM_REFERRAL: "instagram_referral",
  INSTAGRAM_VERIFICATION: "instagram_verification",
  SURVEY_INVITATION: "survey_invitation",
  REFILL_REQUEST: "refill_request",
  NOT_ELIGIBLE_REFERRAL: "not_eligible_referral",
} as const;

export const REQUIRED_MESSAGE_TEMPLATE_KEYS = Object.values(
  MESSAGE_TEMPLATE_KEYS,
);
