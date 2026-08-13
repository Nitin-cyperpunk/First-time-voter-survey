"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

export function useClientPagination<T>(
  items: T[],
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(Math.min(Math.max(1, nextPage), totalPages));
    },
    [totalPages],
  );

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    totalPages,
    totalItems: items.length,
    pageItems,
    goToPage,
    resetPage,
    setPage,
  };
}
