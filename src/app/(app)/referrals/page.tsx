import { listReferrals } from "@/server/repositories/admin.repository";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill, type StatusPillVariant } from "@/components/ui/status-pill";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return formatAdminDateTime(date);
}

function rewardVariant(status: string): StatusPillVariant {
  const normalized = status.toLowerCase();
  if (normalized.includes("paid") || normalized.includes("success")) return "success";
  if (normalized.includes("earned")) return "review";
  if (normalized.includes("fail") || normalized.includes("reject")) return "fail";
  if (normalized.includes("pending")) return "pending";
  return "review";
}

export default async function ReferralsOpsPage() {
  const referrals = await listReferrals();

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Referrals & attribution
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-plum-muted">
          {referrals.length} referral edge{referrals.length === 1 ? "" : "s"}
          . Each row links a referrer, a referred participant, and the reward
          review state.
        </p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referrer</TableHead>
              <TableHead>Referrer mobile</TableHead>
              <TableHead>Referred</TableHead>
              <TableHead>Referred mobile</TableHead>
              <TableHead>Reward status</TableHead>
              <TableHead>Earned</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No referrals yet.
                </TableCell>
              </TableRow>
            ) : (
              referrals.map((referral) => (
                <TableRow key={referral.id}>
                  <TableCell className="font-medium">
                    {referral.referrerName}
                  </TableCell>
                  <TableCell>{referral.referrerMobile}</TableCell>
                  <TableCell>{referral.referredName}</TableCell>
                  <TableCell>{referral.referredMobile}</TableCell>
                  <TableCell>
                    <StatusPill variant={rewardVariant(referral.rewardStatus)}>
                      {referral.rewardStatus}
                    </StatusPill>
                  </TableCell>
                  <TableCell>
                    {referral.earnedAt ? formatDate(referral.earnedAt) : "—"}
                  </TableCell>
                  <TableCell>{formatDate(referral.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
