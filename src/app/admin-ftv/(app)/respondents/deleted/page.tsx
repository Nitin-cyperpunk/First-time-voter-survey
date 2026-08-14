import Link from "next/link";

import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { adminPath } from "@/lib/admin-paths";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";
import { DeletedRespondentsTable } from "@/components/admin/deleted-respondents-table";
import { listDeletedRespondents } from "@/server/services/respondent-delete.service";

export const dynamic = "force-dynamic";

export default async function DeletedRespondentsPage() {
  await requireSuperAdmin();
  const respondents = await listDeletedRespondents();

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Deleted respondents
        </h2>
        <p className="mt-1 text-sm text-plum-muted">
          Soft-deleted people are excluded from lists, capacity, and exports.
          Restore returns them to counts. Purge permanently removes the
          respondent rows; referral records stay.
        </p>
        <p className="mt-3 text-sm">
          <Link href={adminPath("/respondents")} className="text-primary underline">
            Back to respondents
          </Link>
        </p>
      </div>
      <DeletedRespondentsTable
        respondents={respondents.map((row) => ({
          ...row,
          deletedAt: row.deletedAt ? formatAdminDateTime(new Date(row.deletedAt)) : "",
          createdAt: formatAdminDateTime(new Date(row.createdAt)),
        }))}
      />
    </div>
  );
}
