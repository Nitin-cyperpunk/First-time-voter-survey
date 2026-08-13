import { REGISTRATION_CORE_FIELDS } from "@/lib/form-export/types";

/** Strip script bodies so template-literal name="…" in JS is not parsed as fields. */
export function stripHtmlScriptTags(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

/** Reject JS template leftovers like q8_${i}_own or ${name}. */
export function isConcreteFieldName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.includes("${") || trimmed.includes("`")) return false;
  return true;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<span[^>]*class="q-hint"[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function slugifyExportPrefix(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (cleaned.length === 0) return "Question";
  if (cleaned.length === 1) return cleaned[0]!;
  return cleaned.slice(0, 2).join("");
}

export function buildFieldOrderFromHtml(
  html: string,
  options?: { excludeCoreFields?: boolean },
): string[] {
  const excludeCore = options?.excludeCoreFields ?? true;
  const order: string[] = [];
  const seen = new Set<string>();
  const regex =
    /<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const name = match[1]?.trim();
    if (!name || !isConcreteFieldName(name)) continue;
    if (excludeCore && (REGISTRATION_CORE_FIELDS.has(name) || name.startsWith("dob_"))) {
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }

  return order;
}

export function splitQuestionBlocks(html: string): string[] {
  const blocks: string[] = [];
  const marker = /<div\s+class="q"[^>]*>/gi;
  const matches = [...html.matchAll(marker)];

  for (let index = 0; index < matches.length; index++) {
    const start = matches[index].index ?? 0;
    const end =
      index + 1 < matches.length
        ? (matches[index + 1].index ?? html.length)
        : html.length;
    blocks.push(html.slice(start, end));
  }

  return blocks;
}

export function extractDataKey(block: string): string | null {
  const match = block.match(/<div\s+class="q"[^>]*\bdata-key="([^"]+)"/i);
  return match?.[1]?.trim() ?? null;
}

export function extractQuestionLabel(block: string): string {
  const match = block.match(
    /<label[^>]*class="q-label"[^>]*>([\s\S]*?)<\/label>/i,
  );
  if (!match?.[1]) return "";
  return stripHtml(match[1]);
}

export function extractInputValues(
  block: string,
  inputType: "radio" | "checkbox",
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  const regex = new RegExp(
    `<input[^>]*type="${inputType}"[^>]*value="([^"]*)"`,
    "gi",
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(block))) {
    const value = decodeEntities(match[1] ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

export function extractOtherSpecifyField(block: string): string | null {
  const match = block.match(
    /<input[^>]*class="[^"]*\bspec\b[^"]*"[^>]*name="([^"]+)"/i,
  );
  const name = match?.[1]?.trim() ?? null;
  if (!name || !isConcreteFieldName(name)) return null;
  return name;
}

export function extractDataOtherValue(block: string): string | null {
  const match = block.match(/data-other="([^"]+)"/i);
  return match?.[1]?.trim() ?? null;
}

export function extractPrimaryFieldName(block: string): string | null {
  const single = block.match(/data-single="([^"]+)"/i);
  if (single?.[1]) return single[1].trim();

  const multi = block.match(/data-multi="([^"]+)"/i);
  if (multi?.[1]) return multi[1].trim();

  const namedInput = block.match(
    /<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/i,
  );
  const name = namedInput?.[1]?.trim() ?? null;
  if (!name || !isConcreteFieldName(name)) return null;
  return name;
}

export type ParsedMatrixRow = {
  label: string;
  fieldName: string;
};

export function extractMatrixRows(block: string): ParsedMatrixRow[] {
  const tableMatch = block.match(/<table[^>]*class="gridtbl"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch?.[1]) return [];

  const rows: ParsedMatrixRow[] = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tableMatch[1]))) {
    const rowHtml = rowMatch[1];
    if (!rowHtml.includes('type="radio"')) continue;

    const labelMatch = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    const fieldMatch = rowHtml.match(/name="([^"]+)"/i);
    if (!labelMatch || !fieldMatch) continue;

    const label = stripHtml(labelMatch[1] ?? "");
    const fieldName = fieldMatch[1]?.trim();
    if (!label || !fieldName || !isConcreteFieldName(fieldName)) continue;

    rows.push({ label, fieldName });
  }

  return rows;
}

export function extractMatrixColumns(block: string): string[] {
  const tableMatch = block.match(/<table[^>]*class="gridtbl"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch?.[1]) return [];

  const headerMatch = tableMatch[1].match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>/i);
  if (!headerMatch?.[1]) return [];

  const columns: string[] = [];
  const cellRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  let cellMatch: RegExpExecArray | null;
  let first = true;

  while ((cellMatch = cellRegex.exec(headerMatch[1]))) {
    const label = stripHtml(cellMatch[1] ?? "");
    if (first) {
      first = false;
      continue;
    }
    if (label) columns.push(label);
  }

  return columns;
}

export function extractDataOtherInline(block: string): boolean {
  const match = block.match(/data-other-inline="([^"]+)"/i);
  if (!match?.[1]) return true;
  const value = match[1].trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

export type ParsedOpenMultiBox = {
  label: string;
  fieldName: string;
};

export function extractOpenMultiBoxes(block: string): ParsedOpenMultiBox[] {
  const boxes: ParsedOpenMultiBox[] = [];
  const seen = new Set<string>();
  const regex = /<input[^>]*type="text"[^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(block))) {
    const tag = match[0];
    if (/class="[^"]*\bspec\b/i.test(tag)) continue;

    const nameMatch = tag.match(/\bname="([^"]+)"/i);
    const placeholderMatch = tag.match(/\bplaceholder="([^"]+)"/i);
    const name = nameMatch?.[1]?.trim();
    if (!name || !isConcreteFieldName(name) || seen.has(name)) continue;
    seen.add(name);

    const label = placeholderMatch?.[1]?.trim()
      ? decodeEntities(placeholderMatch[1])
      : name;
    boxes.push({ fieldName: name, label });
  }

  return boxes;
}

export function detectQuestionType(block: string): {
  type: "matrix" | "multiple_select" | "single_select" | "open_multi" | "repeat" | "text";
  inputType?: string;
} {
  if (block.includes("data-repeat=")) {
    return { type: "repeat" };
  }

  if (block.includes('class="gridtbl"')) {
    return { type: "matrix" };
  }

  if (block.includes("data-multi=") || /type="checkbox"/i.test(block)) {
    return { type: "multiple_select" };
  }

  if (block.includes("data-single=") || /type="radio"/i.test(block)) {
    return { type: "single_select" };
  }

  if (
    block.includes("data-open-multi") ||
    block.includes('class="brand-list"')
  ) {
    const boxes = extractOpenMultiBoxes(block);
    if (boxes.length >= 2) {
      return { type: "open_multi" };
    }
  }

  const textBoxes = extractOpenMultiBoxes(block);
  if (textBoxes.length >= 2) {
    return { type: "open_multi" };
  }

  const inputMatch = block.match(
    /<(?:input|select|textarea)\b[^>]*>/i,
  );
  if (inputMatch) {
    const tag = inputMatch[0];
    if (tag.includes('type="number"')) return { type: "text", inputType: "number" };
    if (tag.includes('type="date"')) return { type: "text", inputType: "date" };
    if (tag.includes('type="email"')) return { type: "text", inputType: "email" };
    if (tag.includes('type="tel"')) return { type: "text", inputType: "tel" };
    if (tag.includes("<textarea")) return { type: "text", inputType: "textarea" };
    if (tag.includes("<select")) return { type: "text", inputType: "select" };
  }

  return { type: "text", inputType: "text" };
}
