"use client";

import { Badge } from "@/components/ui/badge";
import {
  DM_STATUS_LABELS,
  displayDmStatus,
  dmStatusVariant,
  type DmStatus,
} from "@/lib/dm-verify";
import type { Participant } from "@/types/domain";

type DmStatusBadgeProps = {
  participant: Pick<Participant, "status" | "verifiedAt" | "dmStatus">;
};

export function DmStatusBadge({ participant }: DmStatusBadgeProps) {
  const status = displayDmStatus(participant);
  return (
    <Badge variant={dmStatusVariant(status)}>
      {DM_STATUS_LABELS[status as DmStatus]}
    </Badge>
  );
}
