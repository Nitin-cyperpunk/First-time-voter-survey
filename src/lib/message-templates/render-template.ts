import type { TemplateContext } from "@/lib/message-templates/types";

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Maps alternate placeholder keys used in templates to canonical context keys. */
const PLACEHOLDER_ALIASES: Record<string, string> = {
  name: "participant_name",
  full_name: "participant_name",
  participantname: "participant_name",
  phone: "mobile",
  phone_number: "mobile",
  mobilenumber: "mobile",
  leadId: "lead_id",
  leadid: "lead_id",
};

function stringifyContextValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function resolveContextValue(
  key: string,
  context: TemplateContext,
): string | null {
  if (key in context) {
    return stringifyContextValue(context[key]);
  }

  const alias = PLACEHOLDER_ALIASES[key];
  if (alias && alias in context) {
    return stringifyContextValue(context[alias]);
  }

  return null;
}

export function expandTemplateContext(
  context: TemplateContext,
): TemplateContext {
  const participantName = (
    stringifyContextValue(context.participant_name) ||
    stringifyContextValue(context.name) ||
    stringifyContextValue(context.full_name)
  ).trim();

  const mobile = (
    stringifyContextValue(context.mobile) ||
    stringifyContextValue(context.phone) ||
    stringifyContextValue(context.phone_number)
  ).trim();

  const leadId = (
    stringifyContextValue(context.lead_id) ||
    stringifyContextValue(context.leadId)
  ).trim();

  return {
    ...context,
    participant_name: participantName,
    name: participantName,
    full_name: participantName,
    mobile,
    phone: mobile,
    phone_number: mobile,
    lead_id: leadId,
    leadId,
  };
}

export function renderMessageTemplate(
  template: string,
  context: TemplateContext,
): string {
  if (!template) return "";

  const expanded = expandTemplateContext(context);

  return template.replace(PLACEHOLDER_PATTERN, (match, rawKey: string) => {
    const key = rawKey.trim();
    const value = resolveContextValue(key, expanded);
    if (value === null) return match;
    return value;
  });
}

/** @deprecated Use `renderMessageTemplate` */
export const renderTemplate = renderMessageTemplate;

export function slugifyTemplateKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function generateUniqueTemplateKey(
  name: string,
  existing: Record<string, unknown>,
): string {
  const base = slugifyTemplateKey(name) || "template";
  if (!existing[base]) return base;

  let index = 2;
  while (existing[`${base}_${index}`]) {
    index += 1;
  }
  return `${base}_${index}`;
}
