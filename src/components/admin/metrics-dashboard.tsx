"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DashboardMetrics,
  GeographyBreakdown,
  MetricBreakdown,
} from "@/features/respondents/types";
import type {
  DropSeverity,
  FunnelSnapshotStatus,
} from "@/features/respondents/lib/funnel-snapshot";
import { adminPath } from "@/lib/admin-paths";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

const CLEAN_DELIVERABLE_TOOLTIP =
  "Deliverable completes: no fingerprint duplicate (both sides excluded). IP-only flags stay included. Terminated excluded. QC-failed excluded; awaiting QC counts until failed. Admin Pass stays clean.";

function cleanDeliverableHint(
  cleanDeliverable: number,
  closesAt: number,
  funnelStatus: FunnelSnapshotStatus,
  completed: number,
): string {
  const shortfall = Math.max(0, closesAt - cleanDeliverable);
  const base = `of ${closesAt} target · deliverable`;
  if (shortfall <= 0) {
    return `${base} · target met`;
  }
  const need = `${shortfall} more clean needed`;
  if (
    (funnelStatus === "over" || funnelStatus === "full") &&
    cleanDeliverable < closesAt
  ) {
    return `${base} · ${need} · cap is on completed (${completed}), not clean`;
  }
  return `${base} · ${need}`;
}

type SectionKey =
  | "funnel"
  | "target"
  | "acquisition"
  | "terminations"
  | "geography"
  | "timing";

type MetricsDashboardProps = {
  initialMetrics: DashboardMetrics;
};

function formatSyncedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function statusCopy(
  status: FunnelSnapshotStatus,
  formAccepting: boolean,
): { badge: string; pill: string; open: boolean } {
  if (!formAccepting || status === "project-closed") {
    return {
      badge: "Closed — Not Accepting Responses",
      pill: "Closed",
      open: false,
    };
  }
  const map: Record<FunnelSnapshotStatus, string> = {
    open: "Open",
    "near-full": "Near full",
    full: "Full",
    over: "Over",
    "project-closed": "Closed",
  };
  return {
    badge: `Status: ${map[status]}`,
    pill: map[status],
    open: true,
  };
}

function dropChipClass(severity: DropSeverity) {
  if (severity === "lo") return "bg-accent-soft text-text-muted";
  if (severity === "mid") return "bg-accent-soft text-text-body";
  if (severity === "hi") return "bg-accent-soft text-primary";
  return "bg-accent-soft text-text-muted";
}

export function MetricsDashboard({ initialMetrics }: MetricsDashboardProps) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [refreshing, setRefreshing] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    funnel: true,
    target: true,
    acquisition: false,
    terminations: false,
    geography: false,
    timing: false,
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/metrics", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.metrics) {
        setMetrics(payload.metrics as DashboardMetrics);
      }
    } catch {
      // keep last snapshot
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setMetrics(initialMetrics);
  }, [initialMetrics]);

  useEffect(() => {
    setAnimKey((key) => key + 1);
  }, [metrics.syncedAt]);

  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  const { funnel, kpis, config } = metrics;
  const status = statusCopy(funnel.status, funnel.formAccepting);
  const maxStage = Math.max(...funnel.stages.map((s) => s.count), 1);
  const ringOffset = useMemo(() => {
    const pct = Math.min(100, Math.max(0, funnel.completedPct)) / 100;
    return RING_C * (1 - pct);
  }, [funnel.completedPct]);

  function setAll(next: boolean) {
    setOpen({
      funnel: next,
      target: next,
      acquisition: next,
      terminations: next,
      geography: next,
      timing: next,
    });
  }

  return (
    <div
      className={cn(
        "space-y-5 transition-opacity duration-200",
        refreshing && "opacity-75",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            key={animKey}
            className="metrics-sync-flash mt-1 text-xs text-plum-faint"
          >
            Synced {formatSyncedAt(metrics.syncedAt)}
            {refreshing ? " · refreshing…" : ""}
            <span className="mx-1.5">·</span>
            Refetch on focus + every 30s
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-300",
            status.open
              ? "bg-accent-soft text-primary"
              : "bg-accent-soft text-text-muted",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors duration-300",
              status.open ? "bg-primary" : "bg-text-muted",
              refreshing && "animate-pulse",
            )}
          />
          {status.badge}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAll(true)}
        >
          Expand all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAll(false)}
        >
          Collapse all
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {(
          [
            {
              label: "Registered",
              value: kpis.registered,
              hint: "form submitted",
              accent: "rose" as const,
            },
            {
              label: "Completed",
              value: kpis.completed,
              hint: `of ${config.closesAt} cap · qualified`,
              accent: "teal" as const,
            },
            {
              label: "Clean / QC passed",
              value: kpis.cleanDeliverable,
              hint: cleanDeliverableHint(
                kpis.cleanDeliverable,
                config.closesAt,
                funnel.status,
                kpis.completed,
              ),
              tooltip: CLEAN_DELIVERABLE_TOOLTIP,
              accent: "blue" as const,
              emphasize:
                kpis.cleanDeliverable < config.closesAt &&
                (funnel.status === "over" || funnel.status === "full"),
            },
            {
              label: "Terminated",
              value: kpis.terminated,
              hint: "Q1/Q2 screen-out",
              accent: "amber" as const,
            },
            {
              label: "Paid",
              value: kpis.paid,
              hint: "payout recorded",
              accent: "plum" as const,
            },
            {
              label: "Fraud-flagged",
              value: kpis.fraudFlagged,
              hint: "device / IP repeats",
              accent: "amber" as const,
            },
          ] as const
        ).map((tile, index) => (
          <KpiTile
            key={`${animKey}-${tile.label}`}
            label={tile.label}
            value={tile.value}
            hint={tile.hint}
            tooltip={"tooltip" in tile ? tile.tooltip : undefined}
            emphasize={"emphasize" in tile ? tile.emphasize : false}
            accent={tile.accent}
            delayMs={index * 45}
          />
        ))}
      </div>

      {/* Collapsibles */}
      <div className="space-y-3">
        <Collapsible
          title="Recruitment funnel & drop-off"
          summary={`${funnel.stages.map((s) => s.count).join(" → ")}`}
          open={open.funnel}
          onToggle={() => setOpen((s) => ({ ...s, funnel: !s.funnel }))}
        >
          <ul key={animKey} className="space-y-3">
            {funnel.stages.map((stage, index) => (
              <li
                key={stage.key}
                className="metrics-row-enter"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {stage.label}
                    {stage.isBiggestCliff ? (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Biggest cliff
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-xs text-plum-muted">
                    {stage.count}
                    <span>· {stage.pctOfRegistered}% of reg</span>
                    {index > 0 && stage.dropFromPrev > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          dropChipClass(stage.dropSeverity),
                        )}
                      >
                        −{stage.dropPct}%
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700 ease-out",
                      stage.isBiggestCliff ? "bg-accent-hover" : "bg-primary",
                    )}
                    style={{
                      width: `${Math.max(3, (stage.count / maxStage) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {funnel.cliffLabel ? (
            <p
              key={`cliff-${animKey}`}
              className="metrics-row-enter mt-4 rounded-[10px] border border-border bg-accent-soft px-3 py-2 text-sm text-text-body"
              style={{ animationDelay: "180ms" }}
            >
              Biggest drop-off: <strong>{funnel.cliffLabel}</strong> (−
              {funnel.stages.find((s) => s.isBiggestCliff)?.dropFromPrev ??
                0}{" "}
              respondents).
            </p>
          ) : null}
        </Collapsible>

        <Collapsible
          title="Target progress"
          summary={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="font-mono">
                {funnel.completed} / {funnel.closesAt} completed
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  status.open
                    ? "bg-accent-soft text-primary"
                    : "bg-accent-soft text-text-muted",
                )}
              >
                {status.pill}
              </span>
            </span>
          }
          open={open.target}
          onToggle={() => setOpen((s) => ({ ...s, target: !s.target }))}
        >
          <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
            <div className="relative mx-auto flex h-[140px] w-[140px] items-center justify-center">
              <svg
                width="140"
                height="140"
                viewBox="0 0 140 140"
                className="-rotate-90"
                aria-label={`${funnel.completedPct}% of cap`}
              >
                <circle
                  cx="70"
                  cy="70"
                  r={RING_R}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-border"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={RING_R}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={ringOffset}
                  className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="font-mono text-2xl font-bold text-foreground">
                  {funnel.completedPct}%
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-plum-faint">
                  of cap
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <LegendItem label="Target" value={funnel.target} />
                <LegendItem label="Buffer" value={funnel.buffer} />
                <LegendItem
                  label="Closes at"
                  value={funnel.closesAt}
                  emphasize
                />
                <LegendItem label="Completed" value={funnel.completed} />
                <LegendItem label="Terminated" value={funnel.terminated} />
                <LegendItem
                  label="Remaining to cap"
                  value={funnel.remainingToCap}
                />
                <LegendItem label="Paid" value={funnel.paid} />
              </dl>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-plum-faint">
                  Funnel headroom
                </p>
                <HeadroomBar
                  label="Completed"
                  value={funnel.completed}
                  max={funnel.closesAt}
                />
                <HeadroomBar
                  label="Paid"
                  value={funnel.paid}
                  max={funnel.target}
                />
              </div>

              <p className="rounded-[10px] border border-border bg-accent-soft px-3 py-2 text-sm leading-relaxed text-text-primary">
                Buffer gap: {funnel.buffer} extra seats beyond target{" "}
                {funnel.target}. Terminated (Q1/Q2): {funnel.terminated}.
              </p>
            </div>
          </div>
        </Collapsible>

        <Collapsible
          title="Acquisition"
          summary="Source & type"
          open={open.acquisition}
          onToggle={() =>
            setOpen((s) => ({ ...s, acquisition: !s.acquisition }))
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            <BarList title="By source" rows={metrics.acquisitionBySource} />
            <BarList title="By type" rows={metrics.acquisitionByType} />
          </div>
        </Collapsible>

        <Collapsible
          title="Survey terminations"
          summary={
            metrics.terminationsAvailable
              ? `${metrics.terminationsByReason.reduce((n, r) => n + r.count, 0)} events`
              : "pending data"
          }
          open={open.terminations}
          onToggle={() =>
            setOpen((s) => ({ ...s, terminations: !s.terminations }))
          }
        >
          {!metrics.terminationsAvailable ? (
            <PendingNote text="form_terminations table not available yet." />
          ) : metrics.terminationsByReason.length === 0 ? (
            <PendingNote text="No survey terminations recorded yet." />
          ) : (
            <BarList
              title="Screen-out reasons"
              rows={metrics.terminationsByReason}
            />
          )}
        </Collapsible>

        <Collapsible
          title="Geography (soft)"
          summary="Normalized names · not the quota view"
          open={open.geography}
          onToggle={() => setOpen((s) => ({ ...s, geography: !s.geography }))}
        >
          <p className="mb-3 text-sm leading-relaxed text-plum-muted">
            Aggregates alias spellings (Bangalore → Bengaluru) across{" "}
            <strong>all participant statuses</strong>. This is not the 12-per-city
            cap. Quota counts live on{" "}
            <Link
              href={adminPath("/settings")}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              City Targets
            </Link>
            .
          </p>
          {metrics.geographyByCity.length === 0 ? (
            <PendingNote text="No city data on participants yet." />
          ) : (
            <GeographyBarList rows={metrics.geographyByCity} />
          )}
        </Collapsible>

        <Collapsible
          title="Survey timing & abandonment"
          summary={
            metrics.surveyTiming.available
              ? `median ${formatDuration(metrics.surveyTiming.medianDurationSec)}`
              : "pending data"
          }
          open={open.timing}
          onToggle={() => setOpen((s) => ({ ...s, timing: !s.timing }))}
        >
          {metrics.surveyTiming.available ? (
            <div className="space-y-2 text-sm">
              <p>
                Sample size:{" "}
                <span className="font-mono font-semibold">
                  {metrics.surveyTiming.sampleSize}
                </span>
              </p>
              <p>
                Median total duration:{" "}
                <span className="font-mono font-semibold">
                  {formatDuration(metrics.surveyTiming.medianDurationSec)}
                </span>
              </p>
              <p className="text-plum-muted">
                {metrics.surveyTiming.abandonmentNote}
              </p>
            </div>
          ) : (
            <PendingNote
              text={
                metrics.surveyTiming.abandonmentNote ??
                "Survey timing data pending."
              }
            />
          )}
        </Collapsible>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tooltip,
  accent,
  emphasize = false,
  delayMs = 0,
}: {
  label: string;
  value: number;
  hint: string;
  tooltip?: string;
  accent: "rose" | "teal" | "blue" | "plum" | "amber";
  emphasize?: boolean;
  delayMs?: number;
}) {
  const bar = {
    rose: "before:bg-primary",
    teal: "before:bg-[color-mix(in_srgb,var(--accent)_80%,white)]",
    blue: "before:bg-[color-mix(in_srgb,var(--accent)_60%,white)]",
    plum: "before:bg-[color-mix(in_srgb,var(--accent)_45%,white)]",
    amber: "before:bg-[color-mix(in_srgb,var(--accent)_30%,white)]",
  }[accent];

  return (
    <div
      className={cn(
        "metrics-kpi-enter relative overflow-hidden rounded-[14px] border bg-card p-4 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        emphasize ? "border-primary/40 bg-accent-soft/30" : "border-border",
        bar,
      )}
      style={{ animationDelay: `${delayMs}ms` }}
      title={tooltip}
    >
      <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-plum-muted">{hint}</p>
    </div>
  );
}

function Collapsible({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-rose-tint/40 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-plum-muted transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {title}
        </span>
        {summary ? (
          <span className="hidden text-xs text-plum-muted sm:inline">
            {summary}
          </span>
        ) : null}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 py-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function LegendItem({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number | string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-lg font-bold tabular-nums",
          emphasize ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function HeadroomBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-plum-muted">
          {value} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-rose-tint">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function GeographyBarList({ rows }: { rows: GeographyBreakdown[] }) {
  const max = Math.max(...rows.map((r) => r.allParticipants), 1);
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-plum-faint">
        Completes vs all participants
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="capitalize text-foreground">{row.label}</span>
              <span className="font-mono text-xs text-plum-muted">
                {row.completes} completes · {row.allParticipants} all
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-rose-tint">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${(row.completes / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({ title, rows }: { title: string; rows: MetricBreakdown[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-plum-faint">
        {title}
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="capitalize text-foreground">{row.label}</span>
              <span className="font-mono text-xs text-plum-muted">
                {row.count} · {row.percentage}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-rose-tint">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PendingNote({ text }: { text: string }) {
  return (
    <p className="rounded-[10px] border border-dashed border-border bg-rose-tint/30 px-3 py-3 text-sm text-plum-muted">
      Pending data — {text}
    </p>
  );
}
