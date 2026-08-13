import { DmVerifyTable } from "@/components/admin/dm-verify-table";
import { findDispositionLabel } from "@/lib/call-dispositions/parse";
import { displayDmStatus } from "@/lib/dm-verify";
import { buildRefillUrl } from "@/lib/refill-token.service";
import { getCallDispositions } from "@/server/repositories/form-settings.repository";
import { listDmVerifyParticipants } from "@/server/repositories/dm-verify.repository";

export const dynamic = "force-dynamic";

export default async function DmVerifyPage() {
  const [participants, dispositionsConfig] = await Promise.all([
    listDmVerifyParticipants(),
    getCallDispositions(),
  ]);

  const rows = participants.map((participant) => ({
    leadId: participant.leadId,
    fullName: participant.fullName,
    mobile: participant.mobile,
    status: participant.status,
    createdAt: participant.createdAt.toISOString(),
    dmStatus: displayDmStatus(participant),
    verifiedAt: participant.verifiedAt?.toISOString() ?? null,
    surveyAccessGranted: false,
    surveyUrl: null,
    refillUrl: participant.refillToken
      ? buildRefillUrl(participant.refillToken)
      : null,
    instagramId: participant.instagramId,
    instagramVisibility: participant.instagramVisibility ?? "public",
    callDisposition: participant.callDisposition,
    callDispositionLabel: findDispositionLabel(
      dispositionsConfig,
      participant.callDisposition,
    ),
    callDispositionNotes: participant.callDispositionNotes,
    callDispositionAt: participant.callDispositionAt?.toISOString() ?? null,
  }));

  return (
    <DmVerifyTable
      participants={rows}
      dispositionsConfig={dispositionsConfig}
    />
  );
}
