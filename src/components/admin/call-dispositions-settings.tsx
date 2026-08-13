"use client";

import { useState } from "react";
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_CALL_DISPOSITIONS } from "@/lib/call-dispositions/defaults";
import { slugifyDispositionKey } from "@/lib/call-dispositions/parse";
import type {
  CallDispositionOption,
  CallDispositionsConfig,
} from "@/lib/call-dispositions/types";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

type CallDispositionsSettingsProps = {
  initialConfig: CallDispositionsConfig;
  onSaved?: (config: CallDispositionsConfig) => void;
};

export function CallDispositionsSettings({
  initialConfig,
  onSaved,
}: CallDispositionsSettingsProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CallDispositionOption[]>(
    initialConfig.options,
  );
  const [allowNotes, setAllowNotes] = useState(initialConfig.allowNotes);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function markDirty(next: CallDispositionOption[]) {
    setOptions(next);
    setDirty(true);
  }

  function updateOption(
    index: number,
    patch: Partial<CallDispositionOption>,
  ) {
    markDirty(
      options.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    );
  }

  function addOption() {
    const label = "New disposition";
    const baseKey = slugifyDispositionKey(label);
    let key = baseKey;
    let suffix = 2;
    const keys = new Set(options.map((option) => option.key));
    while (keys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    markDirty([...options, { key, label, enabled: true }]);
  }

  function removeOption(index: number) {
    if (options.length <= 1) {
      toastError("At least one disposition is required.");
      return;
    }
    markDirty(options.filter((_, i) => i !== index));
  }

  function resetDefaults() {
    setOptions([...DEFAULT_CALL_DISPOSITIONS]);
    setAllowNotes(true);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const loadingId = toastLoading("Saving call dispositions...");

    try {
      const response = await fetch("/api/admin/call-dispositions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            options: options.map((option) => ({
              ...option,
              key: slugifyDispositionKey(option.key || option.label),
              label: option.label.trim(),
            })),
            allowNotes,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save.");
      }

      setOptions(payload.config?.options ?? options);
      setAllowNotes(payload.config?.allowNotes ?? allowNotes);
      setDirty(false);
      onSaved?.(payload.config ?? { options, allowNotes });
      dismissToast(loadingId);
      toastSuccess("Call dispositions saved.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
        onClick={() => setOpen((value) => !value)}
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Call dispositions
          </h3>
          <p className="mt-0.5 text-xs text-plum-muted">
            Edit outcome options agents choose when recording a call.
          </p>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4 sm:px-5">
          <div className="space-y-2">
            {options.map((option, index) => (
              <div
                key={`${option.key}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center"
              >
                <Input
                  value={option.label}
                  onChange={(event) =>
                    updateOption(index, { label: event.target.value })
                  }
                  placeholder="Label"
                  className="sm:flex-1"
                />
                <label className="flex items-center gap-2 text-sm text-plum-muted">
                  <input
                    type="checkbox"
                    checked={option.enabled}
                    onChange={(event) =>
                      updateOption(index, { enabled: event.target.checked })
                    }
                    className="size-4 rounded border-border"
                  />
                  Enabled
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeOption(index)}
                  aria-label={`Remove ${option.label}`}
                >
                  <Trash2Icon className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={allowNotes}
              onChange={(event) => {
                setAllowNotes(event.target.checked);
                setDirty(true);
              }}
              className="size-4 rounded border-border"
            />
            Allow optional notes when recording outcomes
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={addOption}>
              <PlusIcon className="size-4" />
              Add disposition
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={resetDefaults}
            >
              Reset defaults
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={!dirty || saving}
            >
              {saving ? "Saving..." : "Save dispositions"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
