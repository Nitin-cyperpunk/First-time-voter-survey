"use client";

import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  buildResponseDisplay,
  formatDuration,
  formatResponseTime,
} from "@/lib/response-storage";
import type { ScreenerSchema } from "@/types/domain";

type TerminationDetailsDrawerProps = {
  terminationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type DetailPayload = {
  termination: {
    id: string;
    leadId: string;
    formType: string;
    ruleKey: string;
    ruleLabel: string | null;
    questionKey: string | null;
    questionLabel: string | null;
    answerValue: string | null;
    reasonText: string | null;
    participantStatus: string | null;
    submittedAt: string;
  };
  participant: {
    fullName: string;
    mobile: string;
    status: string;
  } | null;
  screener: {
    answers: Record<string, unknown>;
    responseTimes: Record<string, number> | null;
    totalDurationSec: number | null;
    questionSchema: ScreenerSchema | null;
  } | null;
};

export function TerminationDetailsDrawer({
  terminationId,
  open,
  onOpenChange,
}: TerminationDetailsDrawerProps) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !terminationId) {
      setDetail(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void fetch(`/api/admin/terminations?id=${encodeURIComponent(terminationId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          setDetail(payload as DetailPayload);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [open, terminationId]);

  const responseRows =
    detail?.screener?.answers && detail.screener.questionSchema
      ? buildResponseDisplay(
          detail.screener.answers,
          detail.screener.responseTimes,
          detail.screener.questionSchema,
        )
      : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Termination Details</SheetTitle>
        </SheetHeader>

        {loading ? (
          <p className="mt-6 text-sm text-plum-muted">Loading details...</p>
        ) : !detail ? (
          <p className="mt-6 text-sm text-plum-muted">Select a termination row.</p>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="space-y-2 rounded-[14px] border border-border bg-background p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Matched condition
              </h3>
              <dl className="grid gap-2 text-sm">
                <DetailItem label="Rule" value={detail.termination.ruleLabel ?? detail.termination.ruleKey} />
                <DetailItem label="Question" value={detail.termination.questionLabel ?? detail.termination.questionKey ?? "—"} />
                <DetailItem label="Answer" value={detail.termination.answerValue ?? "—"} />
                <DetailItem label="Reason" value={detail.termination.reasonText ?? "—"} />
                <DetailItem label="Current status" value={detail.participant?.status ?? detail.termination.participantStatus ?? "—"} />
              </dl>
            </section>

            <section className="space-y-2 rounded-[14px] border border-border bg-background p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Participant
              </h3>
              <dl className="grid gap-2 text-sm">
                <DetailItem label="Lead ID" value={detail.termination.leadId} />
                <DetailItem label="Name" value={detail.participant?.fullName ?? "—"} />
                <DetailItem label="Mobile" value={detail.participant?.mobile ?? "—"} />
              </dl>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Full response
              </h3>
              {responseRows.length === 0 ? (
                <p className="text-sm text-plum-muted">No stored response found.</p>
              ) : (
                <div className="space-y-2">
                  {responseRows.map((row) => (
                    <div
                      key={row.questionKey}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <p className="text-xs font-semibold text-plum-muted">
                        {row.label}
                      </p>
                      <p className="mt-1 text-sm text-foreground">{row.answer}</p>
                      <p className="mt-1 text-xs text-plum-muted">
                        Time: {formatResponseTime(row.timeSec)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {detail.screener?.totalDurationSec != null ? (
                <p className="text-xs text-plum-muted">
                  Total duration: {formatDuration(detail.screener.totalDurationSec)}
                </p>
              ) : null}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-plum-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
