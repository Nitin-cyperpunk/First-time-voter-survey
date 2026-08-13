"use client";

import { useMemo } from "react";

import { useBulkSelection } from "@/hooks/use-bulk-selection";
import { useClientPagination } from "@/hooks/use-client-pagination";

type IdentifiableRow = {
  leadId: string;
};

export function useBulkTableState<T extends IdentifiableRow>(
  filteredRows: T[],
  pageSize?: number,
) {
  const bulk = useBulkSelection();
  const pagination = useClientPagination(filteredRows, pageSize);

  const filteredIds = useMemo(
    () => filteredRows.map((row) => row.leadId),
    [filteredRows],
  );

  const pageIds = useMemo(
    () => pagination.pageItems.map((row) => row.leadId),
    [pagination.pageItems],
  );

  const headerCheckboxState = bulk.getHeaderCheckboxState(pageIds);

  const showSelectAllFilteredBanner =
    headerCheckboxState === "checked" &&
    filteredIds.length > pageIds.length &&
    !bulk.allFilteredSelected;

  return {
    bulk,
    pagination,
    filteredIds,
    pageIds,
    headerCheckboxState,
    showSelectAllFilteredBanner,
  };
}
