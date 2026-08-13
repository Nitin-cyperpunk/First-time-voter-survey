import { buildFieldNameToQKeyRecordFromHtml } from "@/lib/form-export/field-q-key-map";

const FIELD_Q_KEY_MAP_SCRIPT =
  '<script src="/forms/field-q-key-map.js"></script>';

/** Remove any prior injected map so a correct one can be rebuilt. */
function stripExistingFieldQKeyMap(html: string): string {
  return html
    .replace(
      /<script\b[^>]*>\s*window\.__concaveFieldQKeyMap\s*=\s*\{[\s\S]*?\}\s*;?\s*<\/script>/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n");
}

export function injectFieldQKeyMap(
  html: string,
  options?: { excludeCoreFields?: boolean },
): string {
  const cleaned = stripExistingFieldQKeyMap(html);
  const record = buildFieldNameToQKeyRecordFromHtml(cleaned, options);
  const inlineScript = `<script>window.__concaveFieldQKeyMap=${JSON.stringify(record)};</script>`;
  const hasHelper = cleaned.includes("/forms/field-q-key-map.js");
  const bundle = hasHelper
    ? inlineScript
    : `${inlineScript}\n  ${FIELD_Q_KEY_MAP_SCRIPT}`;

  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head[^>]*>/i, (match) => `${match}\n  ${bundle}`);
  }

  return `${bundle}\n${cleaned}`;
}
