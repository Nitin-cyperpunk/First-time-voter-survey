const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateVariables(template: string): string[] {
  if (!template) return [];
  const keys = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    keys.add(match[1].trim());
  }
  return [...keys];
}
