"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastError, toastSuccess } from "@/lib/toast";

export type DeletedRespondentRow = {
  leadId: string;
  fullName: string;
  mobile: string;
  city: string | null;
  status: string;
  deletedAt: string;
  deleteReason: string | null;
  screenerCompletionStatus: string | null;
  createdAt: string;
};

type DeletedRespondentsTableProps = {
  respondents: DeletedRespondentRow[];
};

type RestorePayload = {
  error?: string;
  code?: string;
  details?: {
    cityName?: string;
    nextCount?: number;
    capacity?: number;
  };
  slot?: { cityName?: string | null; newCount?: number; capacity?: number | null };
};

export function DeletedRespondentsTable({
  respondents,
}: DeletedRespondentsTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState(respondents);
  const [restoreTarget, setRestoreTarget] = useState<DeletedRespondentRow | null>(
    null,
  );
  const [purgeTarget, setPurgeTarget] = useState<DeletedRespondentRow | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [overCapacityWarning, setOverCapacityWarning] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  function closeDialogs() {
    setRestoreTarget(null);
    setPurgeTarget(null);
    setReason("");
    setConfirmId("");
    setOverCapacityWarning(null);
  }

  async function handleRestore(confirmOverCapacity = false) {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/respondents/${encodeURIComponent(restoreTarget.leadId)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason,
            confirmOverCapacity,
          }),
        },
      );
      const payload = (await response.json()) as RestorePayload;
      if (response.status === 409 && payload.code === "over_capacity") {
        setOverCapacityWarning(payload.error ?? "This restore would exceed capacity.");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Restore failed.");
      }
      setRows((current) =>
        current.filter((row) => row.leadId !== restoreTarget.leadId),
      );
      closeDialogs();
      const slot = payload.slot;
      toastSuccess(
        slot?.cityName
          ? `Restored. ${slot.cityName} is now ${slot.newCount}/${slot.capacity ?? "—"}.`
          : "Respondent restored.",
      );
      router.refresh();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    if (!purgeTarget) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/respondents/${encodeURIComponent(purgeTarget.leadId)}/purge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmLeadId: confirmId.trim(),
            reason,
          }),
        },
      );
      const payload = (await response.json()) as RestorePayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Purge failed.");
      }
      setRows((current) =>
        current.filter((row) => row.leadId !== purgeTarget.leadId),
      );
      closeDialogs();
      toastSuccess("Respondent permanently purged.");
      router.refresh();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Purge failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-[14px] border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-plum-muted">
                  No deleted respondents.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.leadId}>
                  <TableCell className="font-mono text-xs">{row.leadId}</TableCell>
                  <TableCell>{row.fullName}</TableCell>
                  <TableCell>{row.city ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.deletedAt}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {row.deleteReason ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPurgeTarget(null);
                        setRestoreTarget(row);
                        setReason("");
                        setOverCapacityWarning(null);
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="ml-2"
                      onClick={() => {
                        setRestoreTarget(null);
                        setPurgeTarget(row);
                        setReason("");
                        setConfirmId("");
                      }}
                    >
                      Purge
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && closeDialogs()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore respondent</DialogTitle>
            <DialogDescription>
              {restoreTarget
                ? `Return ${restoreTarget.leadId} to lists, counts, and exports.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {overCapacityWarning ? (
            <p className="rounded-[10px] border border-error/30 bg-error/10 p-3 text-sm text-error">
              {overCapacityWarning} Proceeding will leave the city over its
              limit until another respondent is deleted.
            </p>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Reason (required)</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={closeDialogs}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                void handleRestore(overCapacityWarning !== null)
              }
            >
              {busy
                ? "Restoring…"
                : overCapacityWarning
                  ? "Restore anyway"
                  : "Restore"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && closeDialogs()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge permanently</DialogTitle>
            <DialogDescription>
              Irreversible. Referral rows stay with the participant id set to
              empty. Type the lead ID to confirm.
            </DialogDescription>
          </DialogHeader>
          {purgeTarget ? (
            <p className="font-mono text-sm">{purgeTarget.leadId}</p>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type lead ID</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              value={confirmId}
              onChange={(event) => setConfirmId(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Reason (required)</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={closeDialogs}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                busy ||
                reason.trim().length < 3 ||
                confirmId.trim() !== (purgeTarget?.leadId ?? "")
              }
              onClick={() => void handlePurge()}
            >
              {busy ? "Purging…" : "Purge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
