/** Lightweight fuzzy scoring for unmatched-city alias suggestions (never auto-applied). */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

export function fuzzyMatchScore(inputKey: string, candidateKey: string): number {
  if (!inputKey || !candidateKey) return 0;
  if (inputKey === candidateKey) return 100;
  if (candidateKey.startsWith(inputKey) || inputKey.startsWith(candidateKey)) return 88;
  if (candidateKey.includes(inputKey) || inputKey.includes(candidateKey)) return 75;

  const maxLen = Math.max(inputKey.length, candidateKey.length);
  const dist = levenshtein(inputKey, candidateKey);
  const ratio = 1 - dist / maxLen;
  return Math.round(Math.max(0, ratio) * 70);
}

export type FuzzyCandidate = {
  cityId: string;
  name: string;
  state: string;
  areaType: string;
  matchKey: string;
  score: number;
  via: "city" | "alias";
  aliasLabel?: string;
};

export function rankCitySuggestions(
  inputKey: string,
  cities: Array<{
    id: string;
    name: string;
    state: string;
    areaType: string;
    matchKey: string;
  }>,
  aliases: Array<{
    cityId: string;
    alias: string;
    matchKey: string;
    cityName: string;
    state: string;
    areaType: string;
  }>,
  limit = 5,
  minScore = 45,
): FuzzyCandidate[] {
  const scored: FuzzyCandidate[] = [];

  for (const city of cities) {
    const score = fuzzyMatchScore(inputKey, city.matchKey);
    if (score >= minScore) {
      scored.push({
        cityId: city.id,
        name: city.name,
        state: city.state,
        areaType: city.areaType,
        matchKey: city.matchKey,
        score,
        via: "city",
      });
    }
  }

  for (const alias of aliases) {
    const score = fuzzyMatchScore(inputKey, alias.matchKey);
    if (score >= minScore) {
      scored.push({
        cityId: alias.cityId,
        name: alias.cityName,
        state: alias.state,
        areaType: alias.areaType,
        matchKey: alias.matchKey,
        score,
        via: "alias",
        aliasLabel: alias.alias,
      });
    }
  }

  const byCity = new Map<string, FuzzyCandidate>();
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    const existing = byCity.get(item.cityId);
    if (!existing || item.score > existing.score) {
      byCity.set(item.cityId, item);
    }
  }

  return [...byCity.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
