"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

type SearchResult = {
  leadId: string;
  fullName: string;
  mobile: string;
  referralCode: string;
  status: string;
  instagramId?: string | null;
};

export function ParticipantSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/participants/search?q=${encodeURIComponent(trimmed)}`,
        );
        const payload = await response.json();
        if (response.ok) {
          setResults(payload.results ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Search by Lead ID, mobile, name, referral code, or Instagram ID…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim().length >= 2 ? (
        <div className="absolute z-20 mt-1 w-full rounded-[10px] border border-border bg-card shadow-lg">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No participants found.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((result) => (
                <li key={result.leadId}>
                  <Link
                    href={`/respondents/${encodeURIComponent(result.leadId)}`}
                    className="block px-4 py-2.5 text-sm hover:bg-muted/60"
                  >
                    <span className="font-medium">{result.fullName}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {result.leadId}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {result.mobile} · {result.referralCode} · {result.status}
                      {result.instagramId ? ` · @${result.instagramId}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
