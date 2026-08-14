import { titleCaseCityName } from "@/lib/india-states";

/** Lowercase alnum match key: trim, collapse space, strip punctuation/diacritics. */
export function cityMatchKey(raw: string): string {
  return raw
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeCityDisplayName(raw: string): string {
  return titleCaseCityName(raw);
}

export type CityMatchType = "exact" | "alias" | "unmatched";

export type ResolvedCity = {
  raw: string;
  matchKey: string;
  matchType: CityMatchType;
  cityId: string | null;
  name: string | null;
  state: string | null;
  areaType: "urban" | "rural" | null;
  isOpen: boolean;
  isActive: boolean;
  isFull: boolean;
};

export const CITY_FULL_INLINE_MESSAGE = (cityLabel: string) =>
  `Responses from ${cityLabel} are already complete for this study. Please check the city name, or contact the research team if you believe this is an error.`;
