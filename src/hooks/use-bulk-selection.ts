"use client";

import { useCallback, useMemo, useState } from "react";

export type HeaderCheckboxState = "unchecked" | "indeterminate" | "checked";

export function useBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);

  const selectedCount = selectedIds.size;

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const toggleSelection = useCallback((id: string) => {
    setAllFilteredSelected(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAllFilteredSelected(false);
  }, []);

  const toggleAllCurrentPage = useCallback((pageIds: string[]) => {
    if (pageIds.length === 0) return;

    setAllFilteredSelected(false);
    setSelectedIds((current) => {
      const allSelected = pageIds.every((id) => current.has(id));
      const next = new Set(current);

      if (allSelected) {
        for (const id of pageIds) {
          next.delete(id);
        }
      } else {
        for (const id of pageIds) {
          next.add(id);
        }
      }

      return next;
    });
  }, []);

  const selectAllFiltered = useCallback((filteredIds: string[]) => {
    setSelectedIds(new Set(filteredIds));
    setAllFilteredSelected(true);
  }, []);

  const getHeaderCheckboxState = useCallback(
    (pageIds: string[]): HeaderCheckboxState => {
      if (pageIds.length === 0) return "unchecked";

      let selectedOnPage = 0;
      for (const id of pageIds) {
        if (selectedIds.has(id)) selectedOnPage += 1;
      }

      if (selectedOnPage === 0) return "unchecked";
      if (selectedOnPage === pageIds.length) return "checked";
      return "indeterminate";
    },
    [selectedIds],
  );

  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);

  return {
    selectedIds,
    selectedIdList,
    selectedCount,
    allFilteredSelected,
    isSelected,
    toggleSelection,
    toggleAllCurrentPage,
    selectAllFiltered,
    clearSelection,
    getHeaderCheckboxState,
  };
}

export type BulkSelection = ReturnType<typeof useBulkSelection>;
