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
  review: "border-[#EAD9B8] bg-[#F7EEDB] text-amber-950",
  positive: "border-[#C9E5DE] bg-[#E2F0EC] text-[#3E8E7E]",
  neutral: "border-border bg-card text-plum-muted",
  negative: "border-[#F0C7C7] bg-[#F6E3E3] text-[#8D3D3D]",
  softNegative: "border-[#EDE5E8] bg-[#F8F4F6] text-[#6B5D65]",
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
        className={`text-[17px] font-bold text-[#3D2F38] sm:text-[18px] ${showBadge ? "mt-4" : ""}`}
      >
        {title}
      </h2>
      <p className="mt-2.5 whitespace-pre-line text-[15px] leading-relaxed sm:text-base">
        {message}
      </p>
    </div>
  );
}
