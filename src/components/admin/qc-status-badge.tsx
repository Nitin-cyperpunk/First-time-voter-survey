"use client";

import { Button } from "@/components/ui/button";
import {
  deriveDuplicateMatchType,
  DUPLICATE_MATCH_LABELS,
  type DuplicateSignals,
} from "@/lib/respondents/duplicate-visibility";
import {
  autoQcRuleSummary,
  computeAutoQcStatus,
  computeEffectiveQcStatus,
  QC_STATUS_LABELS,
  qcStatusVariant,
  type QcStatusRow,
  type QcStatusValue,
} from "@/lib/respondents/qc-status";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type QcStatusBadgeProps = {
  row: QcStatusRow & DuplicateSignals;
  compact?: boolean;
};

function pillVariant(effective: ReturnType<typeof computeEffectiveQcStatus>, overridden: boolean): StatusPillVariant {
  const v = qcStatusVariant(effective, overridden);
  if (v === "success") return "success";
  if (v === "fail") return "fail";
  if (v === "review") return "review";
  return "completed";
}

export function QcStatusBadge({ row, compact = false }: QcStatusBadgeProps) {
  const auto = computeAutoQcStatus(row);
  const effective = computeEffectiveQcStatus(row);
  const overridden = Boolean(
    row.qcStatusOverride === "pass" ||
      row.qcStatusOverride === "fail" ||
      row.qcStatusOverride === "review",
  );
  const matchType = deriveDuplicateMatchType(row);
  const sourceLeadId = row.originalParticipantLeadId?.trim() || null;
  const isGaming = row.duplicateGamingPattern === "screener_evasion";

  const label = overridden
    ? `${QC_STATUS_LABELS[effective]}*`
    : QC_STATUS_LABELS[effective];

  const pill = (
    <StatusPill variant={pillVariant(effective, overridden)} className="text-[10px]">
      {label}
    </StatusPill>
  );

  if (compact) {
    return pill;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help text-left">
          {pill}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[300px] bg-foreground px-3 py-2 text-left text-background"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
          QC {overridden ? "(admin override)" : "(automatic)"}
        </p>
        <p className="mt-1 text-xs">
          Effective: <strong>{QC_STATUS_LABELS[effective]}</strong>
          {overridden ? (
            <>
              {" "}
              · Auto: {QC_STATUS_LABELS[auto]}
            </>
          ) : null}
        </p>
        <p className="mt-1.5 text-[11px] leading-snug opacity-90">
          {autoQcRuleSummary(row)}
        </p>
        {matchType !== "none" ? (
          <p className="mt-1.5 text-[11px] leading-snug opacity-90">
            Match: {DUPLICATE_MATCH_LABELS[matchType]}
            {sourceLeadId ? ` · ↑ ${sourceLeadId}` : ""}
            {isGaming ? " · Screener evasion" : ""}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Table cell: status pill + override button that opens the reason modal. */
export function QcTableCell({
  row,
  onRequestOverride,
}: {
  row: QcStatusRow & DuplicateSignals;
  onRequestOverride: (newOverride: QcStatusValue) => void;
}) {
  const effective = computeEffectiveQcStatus(row);
  const showPass =
    effective === "fail" || effective === "review";
  const showFail = effective === "pass";

  return (
    <div className="flex min-w-[5.5rem] flex-col items-start gap-1">
      <QcStatusBadge row={row} compact />
      {showPass ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] font-semibold"
          onClick={() => onRequestOverride("pass")}
        >
          → Pass
        </Button>
      ) : null}
      {showFail ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] font-semibold"
          onClick={() => onRequestOverride("fail")}
        >
          → Fail
        </Button>
      ) : null}
    </div>
  );
}

export function qcOverrideFailureContext(row: DuplicateSignals & QcStatusRow) {
  const matchType = deriveDuplicateMatchType(row);
  const sourceLeadId = row.originalParticipantLeadId?.trim() || null;
  const isGaming = row.duplicateGamingPattern === "screener_evasion";
  const auto = computeAutoQcStatus(row);
  const effective = computeEffectiveQcStatus(row);

  return {
    auto,
    effective,
    matchType,
    matchLabel: DUPLICATE_MATCH_LABELS[matchType],
    sourceLeadId,
    isGaming,
    ruleSummary: autoQcRuleSummary(row),
  };
}
