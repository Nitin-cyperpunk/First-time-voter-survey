import { buildParticipantTemplateContext } from "@/features/message-templates/lib/normalize-templates";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import {
  buildWhatsAppShareUrl,
  getRenderedMessage,
} from "@/lib/message-templates/client";

export async function openWhatsAppVerificationDm(input: {
  fullName: string;
  mobile: string;
  leadId: string;
}): Promise<void> {
  const context = buildParticipantTemplateContext({
    fullName: input.fullName,
    mobile: input.mobile,
    leadId: input.leadId,
  });

  const message = await getRenderedMessage(
    MESSAGE_TEMPLATE_KEYS.INSTAGRAM_VERIFICATION,
    context,
  );

  window.open(buildWhatsAppShareUrl(message), "_blank", "noopener,noreferrer");
}
