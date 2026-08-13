import type { StudyConfig } from "@/lib/study-config/types";
import {
  closesAt as computeClosesAt,
  DEFAULT_STUDY_CONFIG,
} from "@/lib/study-config/defaults";
import {
  isEligibilityAccepting,
  isRegistrationAccepting,
} from "@/lib/study-config/gates";

export type FunnelStageKey =
  | "registration"
  | "eligible"
  | "verified"
  | "completed";

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
  | "eligibility-closed"
  | "project-closed";

export type FunnelSnapshot = {
  target: number;
  buffer: number;
  closesAt: number;
  registered: number;
  /** Currently eligible (cap / “Eligible now”). */
  eligible: number;
  /** Reached eligible including verification-phase rejects. */
  eligibleReached: number;
  verified: number;
  /** Reached eligible but not verified (verify gap). */
  notVerified: number;
  completed: number;
  fraudFlagged: number;
  paid: number;
  overrides: number;
  stages: FunnelStage[];
  eligiblePct: number;
  targetPct: number;
  verifyRate: number;
  verifyGap: number;
  remainingToCap: number;
  status: FunnelSnapshotStatus;
  formAccepting: boolean;
  cliffLabel: string | null;
};

export type FunnelCounts = {
  registered: number;
  eligible: number;
  eligibleReached?: number;
  verified: number;
  completed: number;
  fraudFlagged: number;
  paid: number;
  overrides: number;
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
  eligiblePct: number,
  registered: number,
  closesAt: number,
): FunnelSnapshotStatus {
  if (!config.project_open) return "project-closed";
  if (!isEligibilityAccepting(config)) return "eligibility-closed";
  if (registered > closesAt || eligiblePct > 100) return "over";
  if (eligiblePct >= 100 || registered >= closesAt) return "full";
  if (eligiblePct >= 85) return "near-full";
  return "open";
}

/**
 * Funnel math — Registered → Eligible → Verified → Completed.
 * Eligible stage uses “reached eligible” (includes verification rejects) so
 * drop-off after screener is attributed to Eligible → Verified (not verified).
 */
export function buildFunnelSnapshot(
  counts: FunnelCounts,
  config: StudyConfig = DEFAULT_STUDY_CONFIG,
): FunnelSnapshot {
  const target = config.target;
  const buffer = config.buffer;
  const closesAt = computeClosesAt(config);
  const {
    registered,
    eligible,
    verified,
    completed,
    fraudFlagged,
    paid,
    overrides,
  } = counts;
  const eligibleReached = Math.max(
    counts.eligibleReached ?? eligible,
    eligible,
  );
  const notVerified = Math.max(0, eligibleReached - verified);

  const rawStages: Array<{ key: FunnelStageKey; label: string; count: number }> =
    [
      { key: "registration", label: "Registered", count: registered },
      { key: "eligible", label: "Eligible", count: eligibleReached },
      { key: "verified", label: "Verified", count: verified },
      { key: "completed", label: "Completed", count: completed },
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
    const from = rawStages[biggestCliffIndex - 1]!.label;
    const to = rawStages[biggestCliffIndex]!.label;
    // Verification drop-offs read as “not verified” in ops language.
    if (
      rawStages[biggestCliffIndex - 1]!.key === "eligible" &&
      rawStages[biggestCliffIndex]!.key === "verified"
    ) {
      cliffLabel = "Eligible → Not verified";
    } else {
      cliffLabel = `${from} → ${to}`;
    }
  }

  const eligiblePct = pct(eligible, closesAt);
  const targetPct = pct(verified, target);
  const verifyRate = pct(verified, eligibleReached);
  const verifyGap = notVerified;

  return {
    target,
    buffer,
    closesAt,
    registered,
    eligible,
    eligibleReached,
    verified,
    notVerified,
    completed,
    fraudFlagged,
    paid,
    overrides,
    stages,
    eligiblePct,
    targetPct,
    verifyRate,
    verifyGap,
    remainingToCap: Math.max(0, closesAt - eligible),
    status: resolveStatus(config, eligiblePct, registered, closesAt),
    formAccepting: isRegistrationAccepting(config),
    cliffLabel,
  };
}
