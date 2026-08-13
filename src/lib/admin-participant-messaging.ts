import { normalizePhone } from "@/features/referrals/lib/registration";
import type { NormalizedMessageTemplate } from "@/features/message-templates/lib/normalize-templates";
import { resolveTemplateBody } from "@/lib/message-templates/resolve-template-body";
import {
  expandTemplateContext,
  renderMessageTemplate,
} from "@/lib/message-templates/render-template";
import type {
  MessageTemplateChannel,
  TemplateContext,
} from "@/lib/message-templates/types";

export function formatWhatsAppPhone(mobile: string): string {
  const digits = normalizePhone(mobile);
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildWhatsAppParticipantUrl(
  mobile: string,
  message: string,
): string {
  return `https://wa.me/${formatWhatsAppPhone(mobile)}?text=${encodeURIComponent(message)}`;
}

export function renderParticipantMessage(
  template: NormalizedMessageTemplate,
  context: TemplateContext,
): string {
  const body = resolveTemplateBody(template.id, template.body);
  return renderMessageTemplate(body, expandTemplateContext(context)).trim();
}

export function openWhatsAppParticipantMessage(
  mobile: string,
  message: string,
): void {
  if (!message) return;
  window.open(
    buildWhatsAppParticipantUrl(mobile, message),
    "_blank",
    "noopener,noreferrer",
  );
}

export async function sendAdminParticipantMessage(input: {
  channel: MessageTemplateChannel;
  template: NormalizedMessageTemplate;
  context: TemplateContext;
  mobile: string;
}): Promise<"whatsapp" | "instagram"> {
  const message = renderParticipantMessage(input.template, input.context);
  if (!message) {
    throw new Error("EMPTY_MESSAGE");
  }

  if (input.channel === "whatsapp") {
    openWhatsAppParticipantMessage(input.mobile, message);
    return "whatsapp";
  }

  return "instagram";
}
