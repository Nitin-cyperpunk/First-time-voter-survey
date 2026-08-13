"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import {
  normalizeInstagramId,
  persistParticipantInstagramId,
} from "@/lib/instagram";
import { toastError } from "@/lib/toast";

type InstagramIdEditableCellProps = {
  leadId: string;
  value: string | null;
  disabled?: boolean;
  onSaved?: (instagramId: string | null) => void;
  onDraftChange?: (draft: string) => void;
};

export function InstagramIdEditableCell({
  leadId,
  value,
  disabled = false,
  onSaved,
  onDraftChange,
}: InstagramIdEditableCellProps) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value ?? "");
    setError(null);
  }, [value, leadId]);

  async function commit() {
    if (saving || disabled) return;

    const trimmed = draft.trim();
    const current = (value ?? "").trim();

    if (trimmed === current) {
      setError(null);
      return;
    }

    if (!trimmed) {
      setSaving(true);
      try {
        const saved = await persistParticipantInstagramId(leadId, null);
        onSaved?.(saved);
        setError(null);
      } catch (saveError) {
        toastError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save Instagram ID.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const normalized = normalizeInstagramId(trimmed);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    setSaving(true);
    try {
      const saved = await persistParticipantInstagramId(
        leadId,
        normalized.username,
      );
      setDraft(saved ?? normalized.username);
      onSaved?.(saved);
      setError(null);
    } catch (saveError) {
      toastError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save Instagram ID.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
  }

  return (
    <div className="flex min-w-[120px] max-w-[160px] flex-col gap-1">
      <Input
        value={draft}
        disabled={disabled || saving}
        placeholder="Enter Instagram Username"
        aria-label={`Instagram username for ${leadId}`}
        className="h-8 px-2 text-xs"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onDraftChange?.(next);
          if (error) setError(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
      />
      {error ? (
        <p className="text-[10px] leading-tight text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
