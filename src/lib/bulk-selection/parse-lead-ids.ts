const MAX_BULK_LEAD_IDS = 10_000;

export function parseLeadIds(body: unknown): string[] {
  const record = body as { lead_ids?: unknown } | null;
  const raw = record?.lead_ids;

  if (!Array.isArray(raw)) {
    throw new Error("INVALID_LEAD_IDS");
  }

  const ids = [
    ...new Set(
      raw.map((value) => String(value).trim()).filter((value) => value.length > 0),
    ),
  ];

  if (ids.length === 0) {
    throw new Error("EMPTY_LEAD_IDS");
  }

  if (ids.length > MAX_BULK_LEAD_IDS) {
    throw new Error("TOO_MANY_LEAD_IDS");
  }

  return ids;
}

export function mapBulkLeadIdError(error: unknown): string {
  if (!(error instanceof Error)) return "Bulk action failed.";
  switch (error.message) {
    case "INVALID_LEAD_IDS":
      return "lead_ids must be a non-empty array.";
    case "EMPTY_LEAD_IDS":
      return "At least one lead ID is required.";
    case "TOO_MANY_LEAD_IDS":
      return `A maximum of ${MAX_BULK_LEAD_IDS.toLocaleString()} lead IDs is allowed.`;
    default:
      return error.message || "Bulk action failed.";
  }
}
