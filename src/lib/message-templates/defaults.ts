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
  instagram_verification: {
    title: "Instagram Verification",
    channel: "instagram",
    enabled: true,
    template:
      "Hi!\n\nI completed my registration.\n\nName: {{participant_name}}\nMobile: {{mobile}}\nLead ID: {{lead_id}}\n\nPlease verify my registration.",
  },
  survey_invitation: {
    title: "Survey Invitation",
    channel: "instagram",
    enabled: true,
    template:
      "Hi {{participant_name}},\n\nThank you for completing the First-Time Voters Study.\n\n{{referral_link}}",
  },
  refill_request: {
    title: "Refill Request",
    channel: "instagram",
    enabled: true,
    template:
      "Hi {{participant_name}},\n\nPlease refill the form to continue with the study.\n\n{{refill_link}}",
  },
  not_eligible_referral: {
    title: "Referral Only",
    channel: "whatsapp",
    enabled: true,
    template:
      "I wasn't eligible for this study, but you might be!\n\n{{referral_link}}",
  },
};
