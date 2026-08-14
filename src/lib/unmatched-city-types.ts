import type { AreaType } from "@/lib/india-states";
import type { FuzzyCandidate } from "@/lib/city-fuzzy-match";

export type UnmatchedCityRow = {
  matchKey: string;
  raw: string;
  normalized: string;
  count: number;
  latestAt: string;
  rawVariants: string[];
  ignored: boolean;
  suggestions: FuzzyCandidate[];
};

export type RecountCellPreview = {
  state: string;
  areaType: AreaType;
  cellId: string;
  currentAchieved: number;
  incoming: number;
  afterAchieved: number;
  allocation: number;
  overBy: number;
};

export type RecountCityPreview = {
  cityId: string;
  cityName: string;
  state: string;
  areaType: AreaType;
  currentAchieved: number;
  incoming: number;
  afterAchieved: number;
  closesAt: number;
  overBy: number;
};

export type ResolvePreviewItem = {
  matchKey: string;
  sampleRaw: string;
  responseCount: number;
  action: "add_city" | "alias";
  targetCityId: string;
  targetCityName: string;
  matchType: "exact" | "alias";
};

export type ResolvePreview = {
  items: ResolvePreviewItem[];
  totalResponses: number;
  cells: RecountCellPreview[];
  cities: RecountCityPreview[];
  hasOverage: boolean;
};

export type OverQuotaDecision = "raise_city_capacity" | "proceed_over_quota" | "cancel";

export type IgnoredUnmatchedRow = {
  matchKey: string;
  sampleRaw: string;
  responseCount: number;
  ignoredAt: string;
};
