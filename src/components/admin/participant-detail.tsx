"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildResponseDisplay,
  formatDuration,
  formatResponseTime,
} from "@/lib/response-storage";
import { adminPath } from "@/lib/admin-paths";
import { formatAdminDateTime } from "@/lib/format-admin-datetime";
import { toastError } from "@/lib/toast";
import type { ScreenerSchema } from "@/types/domain";

type MasterRecord = {
  participant: {
    leadId: string;
    referralCode: string;
    fullName: string;
    mobile: string;
    dob: string;
    city: string | null;
    status: string;
    referredBy: string | null;
    upiId: string | null;
    createdAt: string;
  };
  referral: {
    referralCode: string;
    referredBy: string | null;
    totalReferrals: number;
    referralStatus: string | null;
    rewardStatus: string | null;
    referralEarnings: number;
  };
  screener: {
    formVersion: number;
    answers: Record<string, unknown>;
    responseTimes: Record<string, number> | null;
    startedAt: string | null;
    submittedAt: string;
    totalDurationSec: number | null;
    questionSchema: ScreenerSchema | null;
    eligibilityDecision: string;
  } | null;
  survey: {
    answers: Record<string, unknown>;
    responseTimes: Record<string, number> | null;
    startedAt: string | null;
    submittedAt: string;
    totalDurationSec: number | null;
    completionPercent: number | null;
    status: string;
  } | null;
  statusHistory: {
    id: string;
    oldStatus: string | null;
    newStatus: string;
    changedBy: string;
    changedAt: string;
    notes: string | null;
  }[];
  registrationTerminations: {
    id: string;
    ruleKey: string;
    ruleLabel: string | null;
    questionLabel: string | null;
    answerValue: string | null;
    reasonText: string | null;
    submittedAt: string;
  }[];
};

type TimelineEvent = {
  timestamp: string;
  event: string;
  actor: string;
  notes: string | null;
};

type ParticipantDetailProps = {
  leadId: string;
};

function statusVariant(status: string): StatusPillVariant {
  const normalized = status.toLowerCase();
  if (normalized.includes("not") || normalized.includes("reject"))
    return "notEligible";
  if (normalized.includes("eligible")) return "eligible";
  if (normalized.includes("pass")) return "success";
  if (normalized.includes("fail")) return "fail";
  if (normalized.includes("paid")) return "success";
  return "lead";
}

function formatDate(value: string) {
  return formatAdminDateTime(value);
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function ParticipantDetail({ leadId }: ParticipantDetailProps) {
  const [record, setRecord] = useState<MasterRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [recordResponse, timelineResponse] = await Promise.all([
        fetch(`/api/admin/participants/${encodeURIComponent(leadId)}`),
        fetch(`/api/admin/participants/${encodeURIComponent(leadId)}/timeline`),
      ]);

      const recordPayload = await recordResponse.json();
      const timelinePayload = await timelineResponse.json();

      if (!recordResponse.ok) {
        throw new Error(recordPayload.error ?? "Failed to load participant.");
      }

      setRecord(recordPayload);
      setTimeline(timelinePayload.events ?? []);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load participant.";
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading participant record…</p>
    );
  }

  if (error || !record) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href={adminPath("/respondents")}>
            <ArrowLeft className="size-4" />
            Back to respondents
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          {error ?? "Participant not found."}
        </p>
      </div>
    );
  }

  const { participant, referral, screener, survey, statusHistory, registrationTerminations } =
    record;
  const screenerRows = screener
    ? buildResponseDisplay(
        screener.answers,
        screener.responseTimes,
        screener.questionSchema,
      )
    : [];
  const surveyRows = survey
    ? buildResponseDisplay(survey.answers, survey.responseTimes, null)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={adminPath("/respondents")}>
            <ArrowLeft className="size-4" />
            Back to respondents
          </Link>
        </Button>
        <StatusPill variant={statusVariant(participant.status)}>
          {participant.status}
        </StatusPill>
      </div>

      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          {participant.fullName}
        </h2>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {participant.leadId} · {participant.mobile}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Basic information">
          <DetailRow label="Lead ID" value={participant.leadId} mono />
          <DetailRow label="Name" value={participant.fullName} />
          <DetailRow label="Mobile" value={participant.mobile} mono />
          <DetailRow label="DOB" value={participant.dob} />
          <DetailRow label="City" value={participant.city ?? "—"} />
          <DetailRow
            label="Registration date"
            value={formatDate(participant.createdAt)}
          />
          <DetailRow label="Current status" value={participant.status} />
          <DetailRow label="UPI ID" value={participant.upiId ?? "—"} mono />
        </Section>

        {registrationTerminations.length > 0 ? (
          <Section title="Not-eligible reasons">
            <div className="space-y-3">
              {registrationTerminations.map((termination) => (
                <div
                  key={termination.id}
                  className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-foreground">
                    {termination.ruleLabel ?? termination.ruleKey}
                  </p>
                  <p className="mt-1 text-plum-muted">
                    {termination.reasonText ??
                      ([termination.questionLabel, termination.answerValue]
                        .filter(Boolean)
                        .join(" = ") ||
                        "Registration form termination")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(termination.submittedAt)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-plum-muted">
              Participant can still refer friends and earn referral rewards.
            </p>
          </Section>
        ) : null}

        <Section title="Referral information">
          <DetailRow
            label="Referral code"
            value={referral.referralCode}
            mono
          />
          <DetailRow
            label="Referred by"
            value={referral.referredBy ?? "—"}
            mono
          />
          <DetailRow
            label="Total referrals"
            value={String(referral.totalReferrals)}
          />
          <DetailRow
            label="Referral status"
            value={referral.referralStatus ?? "—"}
          />
          <DetailRow
            label="Reward status"
            value={referral.rewardStatus ?? "—"}
          />
          <DetailRow
            label="Referral earnings"
            value={formatCurrency(referral.referralEarnings)}
          />
        </Section>
      </div>

      <Section title="Survey">
        {screener ? (
          <>
            <DetailRow
              label="Survey version"
              value={`v${screener.formVersion}`}
            />
            <DetailRow
              label="Eligibility decision"
              value={screener.eligibilityDecision}
            />
            <DetailRow
              label="Submitted"
              value={formatDate(screener.submittedAt)}
            />
            {screener.startedAt ? (
              <DetailRow
                label="Started"
                value={formatDate(screener.startedAt)}
              />
            ) : null}
            {screener.totalDurationSec !== null ? (
              <DetailRow
                label="Total duration"
                value={formatDuration(screener.totalDurationSec)}
              />
            ) : null}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Responses
                </p>
                {screenerRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No answers recorded.</p>
                ) : (
                  <div className="overflow-hidden rounded-[10px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Question</TableHead>
                          <TableHead>Answer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {screenerRows.map((row) => (
                          <TableRow key={row.questionKey}>
                            <TableCell className="font-medium">
                              {row.label}
                            </TableCell>
                            <TableCell>{row.answer}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Response time
                </p>
                {screenerRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No timing data.</p>
                ) : (
                  <div className="overflow-hidden rounded-[10px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Question</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {screenerRows.map((row) => (
                          <TableRow key={`time-${row.questionKey}`}>
                            <TableCell className="font-medium">
                              {row.questionKey}
                            </TableCell>
                            <TableCell>
                              {formatResponseTime(row.timeSec)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No survey submitted.</p>
        )}
      </Section>

      <Section title="Survey">
        {survey ? (
          <>
            <DetailRow label="Survey status" value={survey.status} />
            <DetailRow
              label="Submission time"
              value={formatDate(survey.submittedAt)}
            />
            {survey.totalDurationSec !== null ? (
              <DetailRow
                label="Total duration"
                value={formatDuration(survey.totalDurationSec)}
              />
            ) : null}
            <DetailRow
              label="Completion"
              value={
                survey.completionPercent !== null
                  ? `${survey.completionPercent}%`
                  : "—"
              }
            />
            {surveyRows.length > 0 ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                    Responses
                  </p>
                  <div className="overflow-hidden rounded-[10px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Question</TableHead>
                          <TableHead>Answer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {surveyRows.map((row) => (
                          <TableRow key={row.questionKey}>
                            <TableCell className="font-medium">
                              {row.label}
                            </TableCell>
                            <TableCell>{row.answer}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                    Response time
                  </p>
                  <div className="overflow-hidden rounded-[10px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Question</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {surveyRows.map((row) => (
                          <TableRow key={`survey-time-${row.questionKey}`}>
                            <TableCell className="font-medium">
                              {row.questionKey}
                            </TableCell>
                            <TableCell>
                              {formatResponseTime(row.timeSec)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Survey tracking is reserved for a future release.
          </p>
        )}
      </Section>

      <Section title="Timeline">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No timeline events yet.</p>
        ) : (
          <div className="space-y-3 border-l-2 border-border pl-4">
            {timeline.map((event) => (
              <div key={`${event.event}-${event.timestamp}`} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-rose" />
                <p className="text-sm font-semibold text-foreground">
                  {event.event}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(event.timestamp)} · {event.actor}
                </p>
                {event.notes ? (
                  <p className="mt-1 text-xs text-plum-muted">{event.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Status history">
        {statusHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status changes yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Old status</TableHead>
                  <TableHead>New status</TableHead>
                  <TableHead>Changed by</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusHistory.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.oldStatus ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      {entry.newStatus}
                    </TableCell>
                    <TableCell>{entry.changedBy}</TableCell>
                    <TableCell>{formatDate(entry.changedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-border py-2 text-sm last:border-b-0">
      <span className="text-plum-muted">{label}</span>
      <span
        className={
          mono
            ? "text-right font-mono font-semibold text-foreground"
            : "text-right font-semibold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
