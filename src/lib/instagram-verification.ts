import { buildParticipantTemplateContext } from "@/features/message-templates/lib/normalize-templates";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { getRenderedMessage } from "@/lib/message-templates/client";

export async function getInstagramVerificationMessage(input: {
  fullName: string;
  mobile: string;
  leadId: string;
}): Promise<string> {
  const context = buildParticipantTemplateContext({
    fullName: input.fullName,
    mobile: input.mobile,
    leadId: input.leadId,
  });

  return getRenderedMessage(MESSAGE_TEMPLATE_KEYS.INSTAGRAM_VERIFICATION, context);
}

export { INSTAGRAM_DM_URL } from "@/config/social";
