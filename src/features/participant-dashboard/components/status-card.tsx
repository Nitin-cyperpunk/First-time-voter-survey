import { StatusPill, type StatusPillVariant } from "@/components/ui/status-pill";
import type { DashboardTone } from "@/features/participant-dashboard/types";

type StatusCardProps = {
  badgeLabel: string;
  title: string;
  message: string;
  tone: DashboardTone;
  showBadge?: boolean;
};

const toneClasses: Record<DashboardTone, string> = {
  review: "border-border bg-accent-soft text-text-body",
  positive: "border-primary/20 bg-accent-soft text-primary",
  neutral: "border-border bg-card text-text-muted",
  negative: "border-error/30 bg-error/10 text-error",
  softNegative: "border-border bg-accent-soft text-text-muted",
};

const badgeVariants: Record<DashboardTone, StatusPillVariant> = {
  review: "review",
  positive: "eligible",
  neutral: "lead",
  negative: "notEligible",
  softNegative: "notEligible",
};

export function StatusCard({
  badgeLabel,
  title,
  message,
  tone,
  showBadge = true,
}: StatusCardProps) {
  return (
    <div
      className={`rounded-[14px] border p-6 shadow-sm ${toneClasses[tone]}`}
    >
      {showBadge ? (
        <StatusPill variant={badgeVariants[tone]}>{badgeLabel}</StatusPill>
      ) : null}
      <h2
        className={`text-[17px] font-bold text-text-primary sm:text-[18px] ${showBadge ? "mt-4" : ""}`}
      >
        {title}
      </h2>
      <p className="mt-2.5 whitespace-pre-line text-[15px] leading-relaxed sm:text-base">
        {message}
      </p>
    </div>
  );
}
