import type { MessageTemplatesRecord } from "@/lib/message-templates/types";

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplatesRecord = {
  whatsapp_referral: {
    title: "Referral WhatsApp",
    channel: "whatsapp",
    enabled: true,
    template:
      "Hi 👋\n\nI'm participating in the First-Time Voters Study by Concave Insights.\n\nRegister here:\n\n{{referral_link}}",
  },
  instagram_referral: {
    title: "Referral Instagram",
    channel: "instagram",
    enabled: true,
    template:
      "Hi 👋\n\nJoin me in the First-Time Voters Study.\n\n{{referral_link}}",
  },
  not_eligible_referral: {
    title: "Referral Only",
    channel: "whatsapp",
    enabled: true,
    template:
      "I wasn't eligible for this study, but you might be!\n\n{{referral_link}}",
  },
};
