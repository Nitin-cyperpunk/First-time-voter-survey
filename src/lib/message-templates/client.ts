import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-templates/defaults";
import {
  MESSAGE_TEMPLATE_KEYS,
  resolveWhatsAppSubmissionConfirmationKey,
} from "@/lib/message-templates/keys";
import { resolveTemplateBody } from "@/lib/message-templates/resolve-template-body";
import {
  expandTemplateContext,
  renderMessageTemplate,
} from "@/lib/message-templates/render-template";
import type {
  MessageTemplatesRecord,
  TemplateContext,
} from "@/lib/message-templates/types";

let templatesCache: MessageTemplatesRecord | null = null;
let templatesPromise: Promise<MessageTemplatesRecord> | null = null;

export function clearMessageTemplatesCache() {
  templatesCache = null;
  templatesPromise = null;
}

async function loadMessageTemplates(): Promise<MessageTemplatesRecord> {
  if (templatesCache) return templatesCache;
  if (!templatesPromise) {
    templatesPromise = fetch("/api/message-templates")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to fetch message templates.");
        const payload = await response.json();
        const templates = (payload.templates ?? {}) as MessageTemplatesRecord;
        templatesCache = templates;
        return templates;
      })
      .catch(() => {
        templatesCache = DEFAULT_MESSAGE_TEMPLATES;
        return templatesCache;
      })
      .finally(() => {
        templatesPromise = null;
      });
  }
  return templatesPromise;
}

export async function getRenderedMessage(
  templateKey: string,
  context: TemplateContext,
): Promise<string> {
  const templates = await loadMessageTemplates();
  const expandedContext = expandTemplateContext(context);
  const resolvedKey =
    templateKey === MESSAGE_TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION
      ? resolveWhatsAppSubmissionConfirmationKey(templates)
      : templateKey;
  const entry = templates[resolvedKey] ?? templates[templateKey];
  if (entry?.enabled && entry.template.trim()) {
    return renderMessageTemplate(
      resolveTemplateBody(resolvedKey, entry.template),
      expandedContext,
    );
  }

  const fallback = DEFAULT_MESSAGE_TEMPLATES[templateKey];
  if (fallback?.enabled) {
    return renderMessageTemplate(
      resolveTemplateBody(templateKey, fallback.template),
      expandedContext,
    );
  }

  return "";
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export {
  expandTemplateContext,
  renderMessageTemplate,
  renderTemplate,
} from "@/lib/message-templates/render-template";
