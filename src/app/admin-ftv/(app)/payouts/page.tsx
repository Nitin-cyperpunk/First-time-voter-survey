import { Suspense } from "react";

import { PayoutsTable } from "@/components/admin/payouts-table";

export const dynamic = "force-dynamic";

export default function PayoutsPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Payouts
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-plum-muted">
          Use Referral for the full payout roster (including not-eligible
          referrers). Use Survey for survey completers only so bulk select stays
          scoped. Export works per view; bulk payout is reserved for a future
          release.
        </p>
      </div>

      <Suspense
        fallback={
          <p className="text-sm text-plum-muted">Loading payouts…</p>
        }
      >
        <PayoutsTable />
      </Suspense>
    </div>
  );
}
