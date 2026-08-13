import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

export const ADMIN_EMPTY_VALUE = "—";
export const ADMIN_NOT_APPLICABLE = "Not Applicable";

/** Verbatim table text for termination_reason — display only, no inference. */
export function terminationReasonTableText(
  completionStatus: string | null,
  terminationReason: string | null,
): string | null {
  if (completionStatus === "Completed") return null;
  if (completionStatus === "Terminated") return terminationReason;
  return null;
}

/** Verbatim drawer text for termination_reason — display only, no inference. */
export function terminationReasonDrawerText(
  completionStatus: string | null,
  terminationReason: string | null,
): string {
  if (completionStatus === "Completed") return ADMIN_NOT_APPLICABLE;
  if (completionStatus === "Terminated") {
    return terminationReason ?? ADMIN_EMPTY_VALUE;
  }
  return terminationReason ?? ADMIN_EMPTY_VALUE;
}

type ClampedAdminTextCellProps = {
  text: string | null | undefined;
  className?: string;
  emptyClassName?: string;
};

/** Reusable 2-line clamped cell for admin tables (notes, reasons, rules). */
export function ClampedAdminTextCell({
  text,
  className,
  emptyClassName = "text-muted-foreground",
}: ClampedAdminTextCellProps) {
  if (!text) {
    return <span className={emptyClassName}>{ADMIN_EMPTY_VALUE}</span>;
  }

  return (
    <p
      className={cn(
        "line-clamp-2 wrap-break-word text-sm text-foreground",
        className,
      )}
      title={text}
    >
      {text}
    </p>
  );
}

type TerminationReasonTableCellProps = {
  completionStatus: string | null;
  terminationReason: string | null;
};

export function TerminationReasonTableCell({
  completionStatus,
  terminationReason,
}: TerminationReasonTableCellProps) {
  return (
    <ClampedAdminTextCell
      text={terminationReasonTableText(completionStatus, terminationReason)}
    />
  );
}

type SurveyCompletionStatusBadgeProps = {
  completionStatus: string | null;
};

export function SurveyCompletionStatusBadge({
  completionStatus,
}: SurveyCompletionStatusBadgeProps) {
  if (completionStatus === "Completed") {
    return <StatusPill variant="completed">Completed</StatusPill>;
  }
  if (completionStatus === "Terminated") {
    return <StatusPill variant="fail">Terminated</StatusPill>;
  }
  return (
    <span className="text-sm font-semibold text-muted-foreground">
      {ADMIN_EMPTY_VALUE}
    </span>
  );
}

type TerminationReasonDrawerValueProps = {
  completionStatus: string | null;
  terminationReason: string | null;
  className?: string;
};

export function TerminationReasonDrawerValue({
  completionStatus,
  terminationReason,
  className,
}: TerminationReasonDrawerValueProps) {
  const text = terminationReasonDrawerText(completionStatus, terminationReason);

  return (
    <span
      className={cn(
        "text-right font-semibold text-foreground wrap-break-word",
        className,
      )}
    >
      {text}
    </span>
  );
}
