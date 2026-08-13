"use client";

import { Button } from "@/components/ui/button";

type SelectAllFilteredBannerProps = {
  pageCount: number;
  filteredCount: number;
  onSelectAllFiltered: () => void;
};

export function SelectAllFilteredBanner({
  pageCount,
  filteredCount,
  onSelectAllFiltered,
}: SelectAllFilteredBannerProps) {
  if (filteredCount <= pageCount) return null;

  return (
    <div className="rounded-[14px] border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <span>
        All {pageCount.toLocaleString()} rows on this page are selected.{" "}
      </span>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-sm font-semibold"
        onClick={onSelectAllFiltered}
      >
        Select all {filteredCount.toLocaleString()} matching results
      </Button>
    </div>
  );
}
