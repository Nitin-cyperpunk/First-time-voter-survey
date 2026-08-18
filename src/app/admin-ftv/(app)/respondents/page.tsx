import { Suspense } from "react";
import Link from "next/link";

import { listParticipants } from "@/server/repositories/admin.repository";
import { ParticipantSearch } from "@/components/admin/participant-search";
import { FtvExportButtons } from "@/components/admin/ftv-export-buttons";
import {
  RespondentsTable,
  type RespondentTableRow,
} from "@/components/admin/respondents-table";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";
import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { isSuperAdmin } from "@/lib/roles";
import { adminPath } from "@/lib/admin-paths";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return formatAdminDateTime(date);
}

export default async function RespondentsOpsPage() {
  const [participants, admin] = await Promise.all([
    listParticipants(),
    getCurrentAdmin(),
  ]);
  const canDelete = Boolean(admin && isSuperAdmin(admin.role));
  const rows: RespondentTableRow[] = participants.map((participant) => ({
    leadId: participant.leadId,
    referralCode: participant.referralCode,
    fullName: participant.fullName,
    mobile: participant.mobile,
    dob: participant.dob,
    city: participant.city,
    status: participant.status,
    referredBy: participant.referredBy,
    isFlaggedDuplicate: participant.isFlaggedDuplicate,
    duplicateFlag: participant.duplicateFlag,
    duplicateReason: participant.duplicateReason,
    duplicateDetectedAt: participant.duplicateDetectedAt
      ? formatDate(participant.duplicateDetectedAt)
      : null,
    reviewStatus: participant.reviewStatus,
    originalParticipantLeadId: participant.originalParticipantLeadId,
    duplicateClusterId: participant.duplicateClusterId,
    isFingerprintClusterOriginal: participant.isFingerprintClusterOriginal,
    duplicateGamingPattern: participant.duplicateGamingPattern,
    deviceFingerprint: participant.deviceFingerprint,
    ipAddress: participant.ipAddress,
    hasScreener: participant.hasScreener,
    screenerCompletionStatus: participant.screenerCompletionStatus,
    screenerTerminationReason: participant.screenerTerminationReason,
    acquisitionSource: participant.acquisitionSource,
    acquisitionType: participant.acquisitionType,
    referralPlatform: participant.referralPlatform,
    otherSource: participant.otherSource,
    createdAt: formatDate(participant.createdAt),
    qcStatusOverride: participant.qcStatusOverride ?? null,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Respondents
        </h2>
        <p className="mt-1 text-sm text-plum-muted">
          {participants.length} registered participant
          {participants.length === 1 ? "" : "s"}. Manage responses, QC, and
          exports. Click a row to open details or search by Lead ID, mobile,
          name, or referral code.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0 w-full sm:max-w-xl sm:flex-1">
            <ParticipantSearch />
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-plum-muted">
                Response export
              </p>
              <FtvExportButtons canIncludeDeleted={canDelete} />
            </div>
            {canDelete ? (
              <Link
                href={adminPath("/respondents/deleted")}
                className="text-sm font-medium text-primary underline"
              >
                Deleted respondents
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="rounded-[14px] border border-border bg-card p-6 text-sm text-plum-muted shadow-sm">
            Loading respondents…
          </div>
        }
      >
        <RespondentsTable participants={rows} canDelete={canDelete} />
      </Suspense>
    </div>
  );
}
