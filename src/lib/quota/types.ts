import type { AreaType } from "@/lib/india-states";

export type QuotaCityRow = {
  id: string;
  name: string;
  state: string;
  areaType: AreaType;
  target: number;
  buffer: number;
  closesAt: number;
  achieved: number;
  remaining: number;
  pctFull: number;
  isOpen: boolean;
  isActive: boolean;
  hasResponses: boolean;
  daysSinceLastCompletion: number | null;
};

export type QuotaCellRow = {
  state: string;
  areaType: AreaType;
  cellId: string;
  allocation: number;
  delta: number;
  achieved: number;
  remaining: number;
  pctFull: number;
  closesAtSum: number;
  daysSinceLastCompletion: number | null;
  cities: QuotaCityRow[];
};

export type QuotaStateRow = {
  state: string;
  allocation: number;
  allocationManual: boolean;
  urbanPct: number;
  urbanPctManual: boolean;
  achieved: number;
  remaining: number;
  pctFull: number;
  urban: QuotaCellRow;
  rural: QuotaCellRow;
};

export type QuotaSnapshot = {
  totalCapacity: number;
  urbanPct: number;
  reallocation: {
    minFillPct: number;
    afterDays: number;
    maxTransferPctOfRemaining: number;
  };
  achievedGlobal: number;
  achievedUrban: number;
  achievedRural: number;
  unweightedUrbanPct: number | null;
  skewPoints: number | null;
  stateAllocationSum: number;
  unallocated: number;
  totalClosesAt: number;
  cellWarning: string | null;
  states: QuotaStateRow[];
  reallocations: Array<{
    id: string;
    createdAt: string;
    actorEmail: string | null;
    fromState: string;
    fromAreaType: AreaType;
    toState: string;
    toAreaType: AreaType;
    amount: number;
    reason: string | null;
    fromDaysSinceLastCompletion: number | null;
  }>;
};
