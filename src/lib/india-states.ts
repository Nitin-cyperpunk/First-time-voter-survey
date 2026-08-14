/** Canonical India States / UTs — same labels as Q15_1. Config city.state must use these. */

export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export const INDIA_UTS = [
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi (NCT of Delhi)",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

export const INDIA_REGIONS = [...INDIA_STATES, ...INDIA_UTS] as const;

export type IndiaRegion = (typeof INDIA_REGIONS)[number];

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
}

const REGION_BY_FOLD = new Map(
  INDIA_REGIONS.map((label) => [fold(label), label] as const),
);

const STATE_ALIASES: Record<string, IndiaRegion> = {
  maharahtra: "Maharashtra",
  maharahatra: "Maharashtra",
  maharahstra: "Maharashtra",
  maharastra: "Maharashtra",
  maharashtra: "Maharashtra",
  nctofdelhi: "Delhi (NCT of Delhi)",
  delhi: "Delhi (NCT of Delhi)",
  pondicherry: "Puducherry",
  orissa: "Odisha",
};

export function isIndiaRegion(value: string): value is IndiaRegion {
  return (INDIA_REGIONS as readonly string[]).includes(value);
}

/** Map free-text / typos onto the Q15_1 list. Returns null if unknown. */
export function resolveIndiaState(raw: string): IndiaRegion | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isIndiaRegion(trimmed)) return trimmed;
  const key = fold(trimmed);
  return STATE_ALIASES[key] ?? REGION_BY_FOLD.get(key) ?? null;
}

/** Trim, collapse internal whitespace, title-case. */
export function titleCaseCityName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9]{2,5}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export type AreaType = "urban" | "rural";

export function parseAreaType(value: unknown): AreaType {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (
    raw === "rural" ||
    raw === "local" ||
    raw === "non_urban" ||
    raw === "nonurban"
  ) {
    return "rural";
  }
  return "urban";
}

export function quotaCellId(
  state: string,
  areaType: AreaType,
): `${string}|urban` | `${string}|rural` {
  return `${state}|${areaType}`;
}
