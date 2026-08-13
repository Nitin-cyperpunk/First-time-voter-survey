import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { renderTemplate } from "@/lib/message-templates/render-template";
import type { TemplateContext } from "@/lib/message-templates/types";
import {
  getEnabledMessageTemplates,
  getMessageTemplates,
  mergeMessageTemplates,
  parseMessageTemplatesRecord,
  updateMessageTemplates,
} from "@/server/repositories/form-settings.repository";

export async function fetchEnabledMessageTemplatesForClient() {
  const templates = await getMessageTemplates();
  return getEnabledMessageTemplates(templates);
}

export async function fetchMessageTemplatesForAdmin() {
  return getMessageTemplates();
}

export function validateMessageTemplatesPayload(
  raw: unknown,
): { ok: true; templates: ReturnType<typeof parseMessageTemplatesRecord> } | { ok: false; error: string } {
  const templates = parseMessageTemplatesRecord(raw);

  for (const [key, template] of Object.entries(templates)) {
    if (!key.trim()) {
      return { ok: false, error: "Template keys cannot be empty." };
    }
    if (!template.title.trim()) {
      return { ok: false, error: `Template "${key}" requires a name.` };
    }
    if (!template.template.trim()) {
      return { ok: false, error: `Template "${template.title}" requires message text.` };
    }
  }

  return { ok: true, templates };
}

export async function saveMessageTemplates(raw: unknown) {
  const validation = validateMessageTemplatesPayload(raw);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return updateMessageTemplates(validation.templates);
}

export function renderMessageFromTemplates(
  templates: Awaited<ReturnType<typeof getMessageTemplates>>,
  templateKey: string,
  context: TemplateContext,
): string | null {
  const entry = templates[templateKey];
  if (!entry?.enabled) return null;
  return renderTemplate(entry.template, context);
}

export function renderMessageWithFallback(
  templates: Awaited<ReturnType<typeof getMessageTemplates>>,
  templateKey: string,
  context: TemplateContext,
): string {
  const rendered = renderMessageFromTemplates(templates, templateKey, context);
  if (rendered !== null) return rendered;

  const merged = mergeMessageTemplates({});
  const fallback = merged[templateKey];
  if (fallback?.enabled) {
    return renderTemplate(fallback.template, context);
  }
  return "";
}

export { MESSAGE_TEMPLATE_KEYS };
