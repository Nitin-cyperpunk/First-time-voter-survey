import { getInstagramSocialConfig } from "@/config/social";
import { buildParticipantTemplateContext } from "@/features/message-templates/lib/normalize-templates";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-templates/defaults";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { resolveTemplateBody } from "@/lib/message-templates/resolve-template-body";
import { renderMessageTemplate } from "@/lib/message-templates/render-template";
import {
  buildTrackedReferralLink,
  normalizeReferralCode,
  type ReferralPlatform,
} from "@/lib/referral-code";
import { buildReferralLink } from "@/lib/referral-code.service";
import type { Participant } from "@/types/domain";
import { getMessageTemplates } from "@/server/repositories/form-settings.repository";

const ALLOWED_TEMPLATE_KEYS = new Set<string>(
  Object.values(MESSAGE_TEMPLATE_KEYS),
);

const REFERRAL_PLATFORMS = new Set<ReferralPlatform>([
  "whatsapp",
  "instagram",
  "copy",
]);

function isAllowedTemplateKey(value: string): boolean {
  return ALLOWED_TEMPLATE_KEYS.has(value);
}

function resolveTemplateBodyForKey(templateKey: string): string {
  const templates = DEFAULT_MESSAGE_TEMPLATES;
  const fallback =
    templates[templateKey as keyof typeof templates]?.template ?? "";
  return resolveTemplateBody(templateKey, fallback);
}

export async function renderParticipantMessage(
  participant: Participant,
  templateKey: string,
  options?: { platform?: ReferralPlatform },
): Promise<{ message: string; instagramDmUrl: string }> {
  if (!isAllowedTemplateKey(templateKey)) {
    throw new Error("INVALID_TEMPLATE_KEY");
  }

  const referralCode = normalizeReferralCode(participant.referralCode);
  const baseReferralLink = buildReferralLink(referralCode);
  const referralLink =
    options?.platform && REFERRAL_PLATFORMS.has(options.platform)
      ? buildTrackedReferralLink(referralCode, options.platform)
      : baseReferralLink;

  const context = buildParticipantTemplateContext({
    fullName: participant.fullName,
    mobile: participant.mobile,
    leadId: participant.leadId,
    referralLink,
  });

  const templates = await getMessageTemplates();
  const entry = templates[templateKey];
  const templateBody =
    entry?.enabled && entry.template.trim()
      ? resolveTemplateBody(templateKey, entry.template)
      : resolveTemplateBodyForKey(templateKey);

  return {
    message: renderMessageTemplate(templateBody, context),
    instagramDmUrl: getInstagramSocialConfig().dmUrl,
  };
}

export async function buildRegistrationThankYouMessages(participant: Participant) {
  const [
    instagram_verification,
    instagram_referral,
    whatsapp_referral,
    not_eligible_referral,
  ] = await Promise.all([
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.INSTAGRAM_VERIFICATION,
    ),
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
      { platform: "instagram" },
    ),
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.WHATSAPP_REFERRAL,
      { platform: "whatsapp" },
    ),
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL,
      { platform: "whatsapp" },
    ),
  ]);

  return {
    instagram_verification,
    instagram_referral,
    whatsapp_referral,
    not_eligible_referral,
  };
}

export function parseReferralPlatform(
  value: string | null,
): ReferralPlatform | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase() as ReferralPlatform;
  return REFERRAL_PLATFORMS.has(normalized) ? normalized : undefined;
}
