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
