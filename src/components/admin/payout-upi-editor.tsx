"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastUpiInvalid,
  toastUpiSaved,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

type PayoutUpiEditorProps = {
  leadId: string;
  upiId: string | null;
  onSaved: (upiId: string | null) => void;
  /** Compact table cell vs fuller drawer layout. */
  variant?: "cell" | "drawer";
};

export function PayoutUpiEditor({
  leadId,
  upiId,
  onSaved,
  variant = "cell",
}: PayoutUpiEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(upiId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(upiId ?? "");
  }, [upiId, editing]);

  async function save() {
    const trimmed = value.trim();
    const next = trimmed.length > 0 ? trimmed : null;

    if ((next ?? "") === (upiId ?? "")) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const loadingId = toastLoading("Saving UPI ID...");

    try {
      const response = await fetch(
        `/api/admin/participants/${encodeURIComponent(leadId)}/upi`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upiId: next }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        dismissToast(loadingId);
        if (payload.code === "INVALID_UPI") {
          toastUpiInvalid();
          return;
        }
        throw new Error(payload.error ?? "Failed to save UPI ID.");
      }

      const saved = (payload.upiId as string | null) ?? null;
      onSaved(saved);
      setEditing(false);
      dismissToast(loadingId);
      toastUpiSaved();
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error ? error.message : "Failed to save UPI ID.",
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(upiId ?? "");
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          "group flex max-w-full items-center gap-1.5 text-left",
          variant === "drawer" && "w-full justify-end",
        )}
        onClick={() => setEditing(true)}
        aria-label={upiId ? `Edit UPI ID ${upiId}` : "Add UPI ID"}
      >
        {upiId ? (
          <span className="truncate font-mono text-[11.5px] text-foreground">
            {upiId}
          </span>
        ) : (
          <StatusPill variant="pending">UPI pending</StatusPill>
        )}
        <PencilIcon className="size-3.5 shrink-0 text-plum-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-center gap-1",
        variant === "drawer" && "w-full max-w-[240px]",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="name@upi"
        disabled={saving}
        autoFocus
        aria-label="UPI ID"
        className={cn(
          "h-8 font-mono text-[11.5px]",
          variant === "cell" ? "min-w-[140px] max-w-[180px]" : "flex-1",
        )}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="size-8 shrink-0 p-0"
        disabled={saving}
        aria-label="Save UPI ID"
      >
        <CheckIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="size-8 shrink-0 p-0"
        disabled={saving}
        onClick={cancel}
        aria-label="Cancel UPI edit"
      >
        <XIcon className="size-3.5" />
      </Button>
    </form>
  );
}
