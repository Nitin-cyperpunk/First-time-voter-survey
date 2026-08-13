/**
 * Soft city spelling collapse for geography reporting (no quotas).
 * Port of RLG city_normalization patterns for common India variants.
 */
const CITY_ALIASES: Record<string, string> = {
  bombay: "Mumbai",
  mumbai: "Mumbai",
  "navi mumbai": "Mumbai",
  "greater mumbai": "Mumbai",
  delhi: "Delhi",
  "new delhi": "Delhi",
  "noida": "Delhi NCR",
  gurgaon: "Delhi NCR",
  gurugram: "Delhi NCR",
  "delhi ncr": "Delhi NCR",
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bangaluru: "Bengaluru",
  madras: "Chennai",
  chennai: "Chennai",
  calcutta: "Kolkata",
  kolkata: "Kolkata",
  pune: "Pune",
  poona: "Pune",
  hyderabad: "Hyderabad",
  secunderabad: "Hyderabad",
  ahmedabad: "Ahmedabad",
  ahmadabad: "Ahmedabad",
  jaipur: "Jaipur",
  lucknow: "Lucknow",
  chandigarh: "Chandigarh",
  indore: "Indore",
  bhopal: "Bhopal",
  surat: "Surat",
  kanpur: "Kanpur",
  nagpur: "Nagpur",
  cochin: "Kochi",
  kochi: "Kochi",
  trivandrum: "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram",
  vizag: "Visakhapatnam",
  visakhapatnam: "Visakhapatnam",
};

export function normalizeCityName(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Unknown";
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (CITY_ALIASES[key]) return CITY_ALIASES[key]!;
  // Title-case unknown cities for display consistency.
  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function aggregateNormalizedCities(
  cities: (string | null | undefined)[],
): Array<{ label: string; count: number; percentage: number }> {
  const total = cities.length;
  const counts = new Map<string, number>();
  for (const city of cities) {
    const label = normalizeCityName(city);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
