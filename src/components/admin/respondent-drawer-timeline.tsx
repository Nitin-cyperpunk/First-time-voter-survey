"use client";

import { useEffect, useState } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";

type TimelineEntry = {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string;
  changedAt: string;
  notes: string | null;
};

type RespondentDrawerTimelineProps = {
  leadId: string;
};

export function RespondentDrawerTimeline({
  leadId,
}: RespondentDrawerTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/admin/participants/${encodeURIComponent(leadId)}`,
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load activity.");
        }
        if (!cancelled) {
          setEntries(payload.statusHistory ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load activity.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return (
      <p className="text-xs text-plum-muted">Loading activity timeline…</p>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-plum-muted">No status changes recorded yet.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            {entry.oldStatus ? (
              <StatusPill variant="lead">{entry.oldStatus}</StatusPill>
            ) : null}
            <span className="text-muted-foreground">→</span>
            <StatusPill variant="review">{entry.newStatus}</StatusPill>
          </div>
          <p className="mt-1 text-plum-muted">
            {formatAdminDateTime(entry.changedAt)} ·{" "}
            {entry.changedBy}
          </p>
          {entry.notes ? (
            <p className="mt-1 text-foreground">{entry.notes}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
