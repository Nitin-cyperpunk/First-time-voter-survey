import type { Json } from "@/lib/supabase/types";
import { extractQuestionAnswers } from "@/lib/survey-response-document";

export type ParticipantBasicContact = {
  email: string | null;
  area: string | null;
  pincode: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function pickFromRecord(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  const lowerMap = new Map<string, unknown>();
  Object.entries(record).forEach(([key, value]) => {
    lowerMap.set(key.toLowerCase(), value);
  });

  for (const key of keys) {
    const direct = trimOrNull(record[key]);
    if (direct) return direct;
    const lower = trimOrNull(lowerMap.get(key.toLowerCase()));
    if (lower) return lower;
  }

  return null;
}

function fromExportJson(exportJson: Json | null | undefined): ParticipantBasicContact {
  if (!exportJson || typeof exportJson !== "object" || Array.isArray(exportJson)) {
    return { email: null, area: null, pincode: null };
  }

  const record = exportJson as Record<string, unknown>;
  return {
    email: pickFromRecord(record, ["email", "Email"]),
    area: pickFromRecord(record, ["area", "Area", "area you reside"]),
    pincode: pickFromRecord(record, [
      "zip",
      "Zip",
      "pincode",
      "Pincode",
      "PIN",
      "Zip / PIN code",
    ]),
  };
}

function fromAnswersJson(answers: Json | null | undefined): ParticipantBasicContact {
  if (!answers) {
    return { email: null, area: null, pincode: null };
  }

  const flat = extractQuestionAnswers(answers as Record<string, unknown>);
  return {
    email: trimOrNull(flat.email),
    area: trimOrNull(flat.area),
    pincode: trimOrNull(flat.zip ?? flat.pincode),
  };
}

/**
 * Best-effort extraction from a screener row before it is cleared on refill request.
 */
export function extractBasicContactFromScreenerRow(row: {
  answers?: Json | null;
  normalized_export?: Json | null;
  csv_row?: Json | null;
} | null): ParticipantBasicContact {
  if (!row) {
    return { email: null, area: null, pincode: null };
  }

  const fromAnswers = fromAnswersJson(row.answers);
  const fromNormalized = fromExportJson(row.normalized_export);
  const fromCsv = fromExportJson(row.csv_row);

  return {
    email: fromAnswers.email ?? fromNormalized.email ?? fromCsv.email,
    area: fromAnswers.area ?? fromNormalized.area ?? fromCsv.area,
    pincode:
      fromAnswers.pincode ?? fromNormalized.pincode ?? fromCsv.pincode,
  };
}
