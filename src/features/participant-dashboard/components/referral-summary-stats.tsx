import { StatTile } from "@/components/ui/stat-tile";
import type { ParticipantReferralStats } from "@/features/participant-dashboard/types";

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

type ReferralSummaryStatsProps = {
  stats: ParticipantReferralStats;
  variant?: "full" | "earnings" | "notEligible";
};

export function ReferralSummaryStats({
  stats,
  variant = "full",
}: ReferralSummaryStatsProps) {
  if (variant === "notEligible") {
    const tiles = [
      { label: "Referred", value: stats.referredCount },
      { label: "Qualified", value: stats.qualifiedCount },
      { label: "Rewards", value: formatInr(stats.totalEarned) },
    ];

    return (
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-[14px] border border-border bg-white px-3 py-4 text-center shadow-sm"
          >
            <p className="text-[28px] font-bold leading-none tracking-[-0.02em] text-[#C2476B]">
              {tile.value}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {tile.label}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "earnings") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Qualified Referrals"
          value={stats.qualifiedCount}
          description="passed quality checks"
          variant="accent"
        />
        <StatTile
          label="Total Rewards"
          value={formatInr(stats.totalEarned)}
          description="referral rewards"
          variant="default"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile
        label="Friends Referred"
        value={stats.referredCount}
        description="total referrals"
        variant="default"
      />
      <StatTile
        label="Qualified Referrals"
        value={stats.qualifiedCount}
        description="passed quality checks"
        variant="accent"
      />
      <StatTile
        label="Total Rewards"
        value={formatInr(stats.totalEarned)}
        description="referral rewards"
        variant="default"
      />
    </div>
  );
}
