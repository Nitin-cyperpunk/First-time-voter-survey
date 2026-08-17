import { listReferrals } from "@/server/repositories/admin.repository";
import { ReferralsTable } from "@/components/admin/referrals-table";

export const dynamic = "force-dynamic";

export default async function ReferralsOpsPage() {
  const referrals = await listReferrals();

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Referrals & attribution
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-plum-muted">
          Each row is one referral edge: who referred whom, and whether the
          reward is earned. Pending means the referred person did not complete
          registration. Hover a pending pill for the reason, or click a row to
          see everyone that referrer brought in.
        </p>
      </div>

      <ReferralsTable
        initialRows={referrals.map((row) => ({
          ...row,
          earnedAt: row.earnedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
