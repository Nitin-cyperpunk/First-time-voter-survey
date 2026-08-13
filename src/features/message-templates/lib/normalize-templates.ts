import { INSTAGRAM_DM_URL } from "@/config/social";
import { formatAdminDate } from "@/lib/format-admin-datetime";
import type {
  MessageTemplateChannel,
  MessageTemplatesRecord,
  TemplateContext,
} from "@/lib/message-templates/types";

export type NormalizedMessageTemplate = {
  id: string;
  name: string;
  channel: MessageTemplateChannel;
  body: string;
  variables: string[];
  isActive: boolean;
};

export function normalizeMessageTemplates(
  templates: MessageTemplatesRecord,
): NormalizedMessageTemplate[] {
  return Object.entries(templates)
    .map(([id, template]) => ({
      id,
      name: template.title,
      channel: template.channel,
      body: template.template,
      variables: [],
      isActive: template.enabled,
    }))
    .filter((template) => template.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterTemplatesByChannel(
  templates: NormalizedMessageTemplate[],
  channel: MessageTemplateChannel,
): NormalizedMessageTemplate[] {
  return templates.filter((template) => template.channel === channel);
}

export type ParticipantTemplateSource = {
  fullName?: string;
  full_name?: string;
  mobile?: string;
  leadId?: string;
  lead_id?: string;
  referralCode?: string;
  referralLink?: string;
  qualifiedCount?: number;
  totalReferrals?: number;
  rewardAmount?: string;
  upiId?: string | null;
};

export function buildParticipantTemplateContext(
  source: ParticipantTemplateSource,
): TemplateContext {
  const participantName = (source.fullName ?? source.full_name ?? "").trim();
  const mobile = (source.mobile ?? "").trim();
  const leadId = (source.leadId ?? source.lead_id ?? "").trim();
  const today = formatAdminDate(new Date());

  return {
    participant_name: participantName,
    name: participantName,
    full_name: participantName,
    mobile,
    phone: mobile,
    phone_number: mobile,
    lead_id: leadId,
    leadId,
    referral_link: source.referralLink ?? "",
    qualified_count: source.qualifiedCount ?? 0,
    total_referrals: source.totalReferrals ?? 0,
    qualified_referrals: source.qualifiedCount ?? 0,
    reward_amount: source.rewardAmount ?? "",
    upi_amount: source.rewardAmount ?? "",
    upi: source.upiId ?? "",
    instagram_url: INSTAGRAM_DM_URL,
    current_date: today,
    todays_date: today,
  };
}
