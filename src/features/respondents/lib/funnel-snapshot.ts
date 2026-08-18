import type { StudyConfig } from "@/lib/study-config/types";
import {
  closesAt as computeClosesAt,
  DEFAULT_STUDY_CONFIG,
} from "@/lib/study-config/defaults";
import {
  isCleanTargetReached,
  isRegistrationAccepting,
} from "@/lib/study-config/gates";

export type FunnelStageKey = "registration" | "completed" | "paid";

export type DropSeverity = "lo" | "mid" | "hi" | "none";

export type FunnelStage = {
  key: FunnelStageKey;
  label: string;
  count: number;
  dropFromPrev: number;
  dropPct: number;
  dropSeverity: DropSeverity;
  pctOfRegistered: number;
  isBiggestCliff: boolean;
};

export type FunnelSnapshotStatus =
  | "open"
  | "near-full"
  | "full"
  | "over"
  | "project-closed";

export type FunnelSnapshot = {
  target: number;
  buffer: number;
  closesAt: number;
  registered: number;
  completed: number;
  terminated: number;
  fraudFlagged: number;
  paid: number;
  stages: FunnelStage[];
  completedPct: number;
  targetPct: number;
  remainingToCap: number;
  remainingToRawCap: number;
  status: FunnelSnapshotStatus;
  formAccepting: boolean;
  cliffLabel: string | null;
};

export type FunnelCounts = {
  registered: number;
  completed: number;
  cleanDeliverable?: number;
  terminated: number;
  fraudFlagged: number;
  paid: number;
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function dropSeverity(dropPct: number): DropSeverity {
  if (dropPct <= 0) return "none";
  if (dropPct < 15) return "lo";
  if (dropPct < 30) return "mid";
  return "hi";
}

function resolveStatus(
  config: StudyConfig,
  cleanCount: number,
): FunnelSnapshotStatus {
  if (config.form_status !== "open") return "project-closed";
  if (cleanCount > config.target) return "over";
  if (isCleanTargetReached(cleanCount, config.target)) return "full";
  const cleanPct = pct(cleanCount, config.target);
  if (cleanPct >= 85) return "near-full";
  return "open";
}

/**
 * Funnel math — Registered → Completed → Paid.
 * Completed = qualified form completions (not Q1/Q2 terminations).
 */
export function buildFunnelSnapshot(
  counts: FunnelCounts,
  config: StudyConfig = DEFAULT_STUDY_CONFIG,
): FunnelSnapshot {
  const target = config.target;
  const buffer = config.buffer;
  const closesAt = computeClosesAt(config);
  const { registered, completed, terminated, fraudFlagged, paid } = counts;
  const cleanDeliverable = counts.cleanDeliverable ?? 0;

  const rawStages: Array<{ key: FunnelStageKey; label: string; count: number }> =
    [
      { key: "registration", label: "Registered", count: registered },
      { key: "completed", label: "Completed", count: completed },
      { key: "paid", label: "Paid", count: paid },
    ];

  let biggestCliffIndex = -1;
  let biggestDrop = -1;
  const stages: FunnelStage[] = rawStages.map((stage, index) => {
    const prev = index === 0 ? stage.count : rawStages[index - 1]!.count;
    const dropFromPrev = Math.max(0, prev - stage.count);
    const dropPct = pct(dropFromPrev, prev);
    if (index > 0 && dropFromPrev > biggestDrop) {
      biggestDrop = dropFromPrev;
      biggestCliffIndex = index;
    }
    return {
      key: stage.key,
      label: stage.label,
      count: stage.count,
      dropFromPrev,
      dropPct,
      dropSeverity: dropSeverity(dropPct),
      pctOfRegistered: pct(stage.count, registered),
      isBiggestCliff: false,
    };
  });

  let cliffLabel: string | null = null;
  if (biggestCliffIndex > 0) {
    stages[biggestCliffIndex] = {
      ...stages[biggestCliffIndex]!,
      isBiggestCliff: true,
    };
    cliffLabel = `${rawStages[biggestCliffIndex - 1]!.label} → ${rawStages[biggestCliffIndex]!.label}`;
  }

  const completedPct = pct(completed, closesAt);
  const targetPct = pct(cleanDeliverable, target);

  return {
    target,
    buffer,
    closesAt,
    registered,
    completed,
    terminated,
    fraudFlagged,
    paid,
    stages,
    completedPct,
    targetPct,
    remainingToCap: Math.max(0, target - cleanDeliverable),
    remainingToRawCap: Math.max(0, closesAt - completed),
    status: resolveStatus(config, cleanDeliverable),
    formAccepting: isRegistrationAccepting(config, cleanDeliverable),
    cliffLabel,
  };
}
