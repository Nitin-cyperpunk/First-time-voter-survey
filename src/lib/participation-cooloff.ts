import { ADMIN_DISPLAY_TIMEZONE } from "@/lib/format-admin-datetime";

export const COOL_OFF_MONTHS = 3;

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function computeEligibleUntil(from: Date = new Date()): Date {
  return addMonths(from, COOL_OFF_MONTHS);
}

export function isWithinCoolOff(eligibleUntil: Date | null | undefined): boolean {
  if (!eligibleUntil) return false;
  return eligibleUntil.getTime() > Date.now();
}

export function isEligibleForParticipation(
  eligibleUntil: Date | null | undefined,
): boolean {
  return !isWithinCoolOff(eligibleUntil);
}

export function formatEligibleDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    timeZone: ADMIN_DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildCoolOffMessage(eligibleUntil: Date): string {
  return `You are currently within the 3-month participation cool-off period. You may participate again after ${formatEligibleDate(eligibleUntil)}.`;
}
