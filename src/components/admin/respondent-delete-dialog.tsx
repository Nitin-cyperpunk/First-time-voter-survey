"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteTarget = {
  leadId: string;
  fullName: string;
  city: string | null;
  status: string;
  createdAt: string;
};

type RespondentDeleteDialogProps = {
  target: DeleteTarget | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function RespondentDeleteDialog({
  target,
  busy,
  onOpenChange,
  onConfirm,
}: RespondentDeleteDialogProps) {
  const [reason, setReason] = useState("");
  const cityLabel = target?.city?.trim() || "this city";

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setReason("");
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete respondent</DialogTitle>
          <DialogDescription>
            Soft-delete {target?.fullName ?? "this respondent"}. Referral rows
            and rewards stay. This can be restored from Deleted respondents.
          </DialogDescription>
        </DialogHeader>

        {target ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-plum-muted">Lead ID</dt>
            <dd className="font-mono">{target.leadId}</dd>
            <dt className="text-plum-muted">City</dt>
            <dd>{target.city?.trim() || "—"}</dd>
            <dt className="text-plum-muted">Status</dt>
            <dd>{target.status}</dd>
            <dt className="text-plum-muted">Registered</dt>
            <dd>{target.createdAt}</dd>
          </dl>
        ) : null}

        <p className="rounded-[10px] border border-border bg-accent-soft p-3 text-sm text-foreground">
          This frees one slot in {cityLabel}. That slot becomes available to a
          new respondent immediately.
        </p>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">
            Reason (required)
          </span>
          <textarea
            className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Why is this respondent being removed?"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void onConfirm(reason.trim())}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
