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
  type DuplicateSignals,
} from "@/lib/respondents/duplicate-visibility";

function variantForMatchType(
  matchType: ReturnType<typeof deriveDuplicateMatchType>,
): StatusPillVariant {
  switch (matchType) {
    case "none":
      return "lead";
    case "ip":
      return "fail";
    case "fingerprint":
      return "review";
    case "both":
      return "notEligible";
  }
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
  const sharedIpLeads = ipAssociatedLeadIds.filter(Boolean);
  const isIpDuplicate = matchType === "ip" || matchType === "both";
  const showIpHover = isIpDuplicate && sharedIpLeads.length > 1;

  const sourceLeadId = row.originalParticipantLeadId?.trim() || null;

  const body =
    matchType === "none" ? (
      <span className="text-sm text-muted-foreground">No</span>
    ) : (
      <div className="flex flex-col gap-1">
        <StatusPill variant={variantForMatchType(matchType)}>Yes</StatusPill>
        <span className="text-[11px] font-medium text-plum-muted">
          {DUPLICATE_MATCH_LABELS[matchType]}
        </span>
        {sourceLeadId ? (
          <span className="font-mono text-[11px] text-plum-muted">
            {sourceLeadId}
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
