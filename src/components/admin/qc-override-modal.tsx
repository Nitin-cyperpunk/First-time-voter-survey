"use client";

import { useEffect, useState } from "react";

import { qcOverrideFailureContext } from "@/components/admin/qc-status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  QC_OVERRIDE_MIN_REASON_LENGTH,
  QC_STATUS_LABELS,
  type QcStatusValue,
} from "@/lib/respondents/qc-status";
import type { DuplicateSignals } from "@/lib/respondents/duplicate-visibility";
import type { QcStatusRow } from "@/lib/respondents/qc-status";

export type QcOverrideTarget = {
  leadId: string;
  fullName: string;
  newOverride: QcStatusValue;
} & DuplicateSignals &
  QcStatusRow;

type QcOverrideModalProps = {
  target: QcOverrideTarget | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function QcOverrideModal({
  target,
  busy,
  onOpenChange,
  onConfirm,
}: QcOverrideModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!target) setReason("");
  }, [target]);

  const context = target ? qcOverrideFailureContext(target) : null;
  const reasonOk = reason.trim().length >= QC_OVERRIDE_MIN_REASON_LENGTH;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setReason("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Override QC to {target ? QC_STATUS_LABELS[target.newOverride] : "—"}
          </DialogTitle>
          <DialogDescription>
            This decision is logged permanently with your account and reason.
          </DialogDescription>
        </DialogHeader>

        {target && context ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-plum-muted">Lead ID</dt>
            <dd className="font-mono">{target.leadId}</dd>
            <dt className="text-plum-muted">Participant</dt>
            <dd>{target.fullName}</dd>
            <dt className="text-plum-muted">Current QC</dt>
            <dd>
              {QC_STATUS_LABELS[context.effective]} (auto:{" "}
              {QC_STATUS_LABELS[context.auto]})
            </dd>
          </dl>
        ) : null}

        {context && context.auto !== "pass" ? (
          <div className="space-y-2 rounded-[10px] border border-border bg-accent-soft p-3 text-sm">
            <p className="font-medium text-foreground">Why automatic QC flagged this</p>
            <p className="text-plum-muted">{context.ruleSummary}</p>
            {context.matchType !== "none" ? (
              <p className="text-plum-muted">
                Duplicate match: <strong>{context.matchLabel}</strong>
                {context.sourceLeadId ? (
                  <>
                    {" "}
                    · first seen <span className="font-mono">{context.sourceLeadId}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {context?.isGaming ? (
          <div className="rounded-[10px] border-2 border-error/40 bg-error/10 p-3 text-sm text-error">
            <p className="font-semibold">Screener evasion detected</p>
            <p className="mt-1 leading-relaxed">
              This person was terminated and later completed again on the same
              device. Passing this record is the highest-consequence override
              available — only proceed if you have verified identity and
              eligibility outside the automatic rules.
            </p>
          </div>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">
            Reason (required, min {QC_OVERRIDE_MIN_REASON_LENGTH} characters)
          </span>
          <textarea
            className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            placeholder="Explain why this override is justified for audit and payout review."
          />
          <span className="mt-1 block text-xs text-plum-muted">
            {reason.trim().length}/{QC_OVERRIDE_MIN_REASON_LENGTH} min
          </span>
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
            disabled={busy || !reasonOk}
            onClick={() => void onConfirm(reason.trim())}
          >
            {busy ? "Saving…" : "Confirm override"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
