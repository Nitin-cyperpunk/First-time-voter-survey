import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-templates/defaults";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";

export function resolveTemplateBody(
  templateKey: string,
  template: string,
): string {
  if (templateKey !== MESSAGE_TEMPLATE_KEYS.INSTAGRAM_VERIFICATION) {
    return template;
  }

  const hasNamePlaceholder =
    /\{\{\s*(participant_name|name|full_name)\s*\}\}/i.test(template);
  const hasMobilePlaceholder =
    /\{\{\s*(mobile|phone|phone_number)\s*\}\}/i.test(template);
  const hasLeadPlaceholder =
    /\{\{\s*(lead_id|leadId)\s*\}\}/i.test(template);

  if (hasNamePlaceholder && hasMobilePlaceholder && hasLeadPlaceholder) {
    return template;
  }

  return DEFAULT_MESSAGE_TEMPLATES.instagram_verification.template;
}
