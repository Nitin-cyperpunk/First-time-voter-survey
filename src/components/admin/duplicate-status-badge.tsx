"use client";

import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deriveDuplicateMatchType,
  DUPLICATE_MATCH_LABELS,
  isFingerprintFlagged,
  type DuplicateSignals,
} from "@/lib/respondents/duplicate-visibility";

// Fingerprint-ineligible and IP-review must be visually distinct.
// They are two separately queryable and separately actionable states.
function variantForMatchType(
  matchType: ReturnType<typeof deriveDuplicateMatchType>,
  isIneligible: boolean,
): StatusPillVariant {
  if (matchType === "none") return "lead";
  // Fingerprint (including "both") → ineligible → stronger colour
  if (isIneligible) return "notEligible";
  // IP-only → review flag only → softer colour
  return "review";
}

type DuplicateStatusBadgeProps = {
  row: DuplicateSignals;
  /** Lead IDs that share this row's IP (including self). Shown on hover when 2+. */
  ipAssociatedLeadIds?: string[];
};

export function DuplicateStatusBadge({
  row,
  ipAssociatedLeadIds = [],
}: DuplicateStatusBadgeProps) {
  const matchType = deriveDuplicateMatchType(row);
  const isIneligible = isFingerprintFlagged(row);
  const sharedIpLeads = ipAssociatedLeadIds.filter(Boolean);
  const isIpDuplicate = matchType === "ip" || matchType === "both";
  const showIpHover = isIpDuplicate && sharedIpLeads.length > 1;

  const sourceLeadId = row.originalParticipantLeadId?.trim() || null;
  const isOriginal = row.isFingerprintClusterOriginal === true;
  const isGaming = row.duplicateGamingPattern === "screener_evasion";

  const body =
    matchType === "none" ? (
      <span className="text-sm text-muted-foreground">No</span>
    ) : (
      <div className="flex flex-col gap-1">
        <StatusPill variant={variantForMatchType(matchType, isIneligible)}>
          {isIneligible
            ? isOriginal
              ? "Ineligible (original)"
              : "Ineligible"
            : "Review"}
        </StatusPill>
        <span className="text-[11px] font-medium text-plum-muted">
          {DUPLICATE_MATCH_LABELS[matchType]}
          {isIneligible && !isOriginal && isGaming ? " · ⚠ Screener evasion" : ""}
          {isIneligible && isOriginal ? " · First seen" : ""}
        </span>
        {sourceLeadId ? (
          <span className="font-mono text-[11px] text-plum-muted">
            ↑ {sourceLeadId}
          </span>
        ) : null}
      </div>
    );

  if (!showIpHover) {
    return body;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help text-left"
          aria-label={`IP shared by ${sharedIpLeads.length} leads`}
        >
          {body}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[280px] bg-foreground px-3 py-2 text-left text-background"
      >
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] opacity-80">
          Leads on this IP ({sharedIpLeads.length})
        </p>
        <ul className="space-y-1 font-mono text-[11px] leading-snug">
          {sharedIpLeads.map((leadId) => (
            <li key={leadId}>{leadId}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
