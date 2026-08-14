import { getInstagramSocialConfig } from "@/config/social";
import { buildParticipantTemplateContext } from "@/features/message-templates/lib/normalize-templates";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-templates/defaults";
import { MESSAGE_TEMPLATE_KEYS, resolveWhatsAppSubmissionConfirmationKey } from "@/lib/message-templates/keys";
import { resolveTemplateBody } from "@/lib/message-templates/resolve-template-body";
import { renderMessageTemplate } from "@/lib/message-templates/render-template";
import { normalizeReferralPlatform } from "@/lib/acquisition";
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

function resolveTemplateBodyForKey(templateKey: string): string {
  const templates = DEFAULT_MESSAGE_TEMPLATES;
  const fallback =
    templates[templateKey as keyof typeof templates]?.template ?? "";
  return resolveTemplateBody(templateKey, fallback);
}

export async function renderParticipantMessage(
  participant: Participant,
  templateKey: string,
  options?: { platform?: ReferralPlatform; baseUrl?: string },
): Promise<{ message: string; instagramDmUrl: string }> {
  const templates = await getMessageTemplates();
  if (!ALLOWED_TEMPLATE_KEYS.has(templateKey) && !templates[templateKey]) {
    throw new Error("INVALID_TEMPLATE_KEY");
  }

  const referralCode = normalizeReferralCode(participant.referralCode);
  const linkOptions = options?.baseUrl ? { baseUrl: options.baseUrl } : undefined;
  const baseReferralLink = buildReferralLink(referralCode, linkOptions);
  const referralLink = options?.platform
    ? buildTrackedReferralLink(referralCode, options.platform, linkOptions)
    : baseReferralLink;

  const context = buildParticipantTemplateContext({
    fullName: participant.fullName,
    mobile: participant.mobile,
    leadId: participant.leadId,
    referralLink,
  });

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

export async function buildRegistrationThankYouMessages(
  participant: Participant,
  options?: { baseUrl?: string },
) {
  const templates = await getMessageTemplates();
  const submissionKey = resolveWhatsAppSubmissionConfirmationKey(templates);

  const [
    instagram_referral,
    whatsapp_referral,
    not_eligible_referral,
    whatsapp_submission_confirmation,
  ] = await Promise.all([
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
      { platform: "instagram", baseUrl: options?.baseUrl },
    ),
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.WHATSAPP_REFERRAL,
      { platform: "whatsapp", baseUrl: options?.baseUrl },
    ),
    renderParticipantMessage(
      participant,
      MESSAGE_TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL,
      { platform: "whatsapp", baseUrl: options?.baseUrl },
    ),
    templates[submissionKey]
      ? renderParticipantMessage(participant, submissionKey, {
          platform: "whatsapp",
          baseUrl: options?.baseUrl,
        })
      : Promise.resolve({ message: "", instagramDmUrl: "" }),
  ]);

  return {
    instagram_referral,
    whatsapp_referral,
    not_eligible_referral,
    whatsapp_submission_confirmation,
  };
}

export function parseReferralPlatform(
  value: string | null,
): ReferralPlatform | undefined {
  return normalizeReferralPlatform(value) ?? undefined;
}
