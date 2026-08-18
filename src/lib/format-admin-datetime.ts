/** Display timezone for all admin-facing timestamps (India). */
export const ADMIN_DISPLAY_TIMEZONE = "Asia/Kolkata";

type FormatAdminDateTimeOptions = {
  /** Date only — omit hour/minute. */
  dateOnly?: boolean;
};

/**
 * Format a timestamp for admin UI in Asia/Kolkata.
 * Avoids server-host TZ drift (local IST vs production UTC).
 */
export function formatAdminDateTime(
  value: Date | string | null | undefined,
  options: FormatAdminDateTimeOptions = {},
): string {
  if (value == null || value === "") return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    timeZone: ADMIN_DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(options.dateOnly
      ? {}
      : {
          hour: "2-digit",
          minute: "2-digit",
        }),
  });
}

export function formatAdminDate(
  value: Date | string | null | undefined,
): string {
  return formatAdminDateTime(value, { dateOnly: true });
}

/** Excel / CSV datetime number format — IST wall clock, no timezone suffix. */
export const EXPORT_DATETIME_NUMBER_FORMAT = "yyyy-mm-dd hh:mm:ss";

function parseInstant(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Shared export formatter: convert a timestamptz instant to IST wall clock.
 * Empty string for null/invalid — never "Invalid Date".
 * Format is Excel-sortable `yyyy-mm-dd hh:mm:ss` (24h). IST belongs in the column header.
 */
export function formatExportDateTime(
  value: Date | string | null | undefined,
): string {
  const date = parseInstant(value);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ADMIN_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** JS Date whose UTC components equal the IST wall clock — SheetJS writes this as Excel local time. */
export function toIstExcelDate(
  value: Date | string | null | undefined,
): Date | "" {
  if (typeof value === "string") {
    const wall = value.trim().match(
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
    );
    if (wall) {
      return new Date(
        Date.UTC(
          Number(wall[1]),
          Number(wall[2]) - 1,
          Number(wall[3]),
          Number(wall[4]),
          Number(wall[5]),
          Number(wall[6]),
        ),
      );
    }
  }
  const formatted = formatExportDateTime(value);
  if (!formatted) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    formatted,
  );
  if (!match) return "";
  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
}

export function isExportDateTimeHeader(header: string): boolean {
  if (header === "dob") return false;
  return (
    /\(IST\)\s*$/i.test(header) ||
    /_at$/i.test(header) ||
    /^Registered(\s*\(IST\))?$/i.test(header) ||
    /^Created date(\s*\(IST\))?$/i.test(header) ||
    /^Payment date(\s*\(IST\))?$/i.test(header) ||
    /decided_at/i.test(header)
  );
}
