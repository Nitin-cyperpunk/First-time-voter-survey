"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { dispositionContradictsVerified } from "@/lib/call-dispositions/defaults";
import { getEnabledDispositions } from "@/lib/call-dispositions/parse";
import type { CallDispositionsConfig } from "@/lib/call-dispositions/types";
import type { DmVerifyRow } from "@/components/admin/dm-verify-table";

type CallOutcomeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DmVerifyRow | null;
  config: CallDispositionsConfig;
  busy: boolean;
  onSubmit: (input: { dispositionKey: string; notes: string }) => Promise<void>;
};

export function CallOutcomeDialog({
  open,
  onOpenChange,
  row,
  config,
  busy,
  onSubmit,
}: CallOutcomeDialogProps) {
  const enabled = getEnabledDispositions(config);
  const isVerified = Boolean(row?.verifiedAt);
  const [dispositionKey, setDispositionKey] = useState("");
  const [notes, setNotes] = useState("");

  const selectionBlocked =
    isVerified && dispositionContradictsVerified(dispositionKey);

  const options = useMemo(
    () =>
      enabled.map((option) => ({
        ...option,
        locked:
          isVerified && dispositionContradictsVerified(option.key),
      })),
    [enabled, isVerified],
  );

  useEffect(() => {
    if (!open) return;
    const enabledOptions = getEnabledDispositions(config);
    const current = row?.callDisposition ?? "";
    const currentLocked =
      Boolean(row?.verifiedAt) && dispositionContradictsVerified(current);

    // Prefer an allowed selection when opening a verified row with a contradictory saved value.
    if (currentLocked) {
      const fallback =
        enabledOptions.find((option) => option.key === "verified")?.key ??
        enabledOptions.find(
          (option) => !dispositionContradictsVerified(option.key),
        )?.key ??
        "";
      setDispositionKey(fallback);
    } else {
      setDispositionKey(current || enabledOptions[0]?.key || "");
    }
    setNotes(row?.callDispositionNotes ?? "");
  }, [open, row, config]);

  async function handleSubmit() {
    if (!dispositionKey || selectionBlocked) return;
    await onSubmit({ dispositionKey, notes });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record call outcome</DialogTitle>
          <DialogDescription>
            {row
              ? `Log the call result for ${row.fullName} (${row.leadId}).`
              : "Select a disposition and optional notes."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label
              htmlFor="call-disposition"
              className="text-sm font-medium text-foreground"
            >
              Disposition
            </label>
            <Select
              id="call-disposition"
              value={dispositionKey}
              onChange={(event) => setDispositionKey(event.target.value)}
              className={
                isVerified
                  ? "[&_option:disabled]:text-plum-faint [&_option:disabled]:opacity-50"
                  : undefined
              }
            >
              <option value="" disabled>
                Select outcome...
              </option>
              {options.map((option) => (
                <option
                  key={option.key}
                  value={option.key}
                  disabled={option.locked}
                  className={
                    option.locked
                      ? "text-plum-faint opacity-50"
                      : undefined
                  }
                >
                  {option.locked
                    ? `${option.label} (locked — already verified)`
                    : option.label}
                </option>
              ))}
            </Select>
            {isVerified ? (
              <p className="text-xs text-plum-muted">
                This participant is verified. Outcomes that contradict
                verification stay listed but cannot be selected.
              </p>
            ) : null}
          </div>

          {config.allowNotes ? (
            <div className="space-y-2">
              <label
                htmlFor="call-disposition-notes"
                className="text-sm font-medium text-foreground"
              >
                Notes <span className="font-normal text-plum-muted">(optional)</span>
              </label>
              <textarea
                id="call-disposition-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Add context from the call..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !dispositionKey || selectionBlocked}
          >
            {busy ? "Saving..." : "Save outcome"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
