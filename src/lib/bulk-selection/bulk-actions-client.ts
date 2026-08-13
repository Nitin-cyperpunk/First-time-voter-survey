"use client";

import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

type BulkActionResponse = {
  success?: boolean;
  count?: number;
  failed?: Array<{ leadId: string; error: string }>;
  error?: string;
};

export async function postBulkLeadIds(
  endpoint: string,
  leadIds: string[],
  extra?: Record<string, unknown>,
): Promise<BulkActionResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_ids: leadIds,
      ...extra,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as BulkActionResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Bulk action failed.");
  }

  return payload;
}

export async function runBulkActionWithToast(options: {
  endpoint: string;
  leadIds: string[];
  loadingMessage: string;
  successMessage: (count: number) => string;
  extra?: Record<string, unknown>;
  onSuccess?: () => void;
}) {
  const loadingId = toastLoading(options.loadingMessage);

  try {
    const result = await postBulkLeadIds(
      options.endpoint,
      options.leadIds,
      options.extra,
    );

    dismissToast(loadingId);

    const failedCount = result.failed?.length ?? 0;
    const succeededCount =
      result.count ?? options.leadIds.length - failedCount;

    if (failedCount > 0) {
      toastError(
        `${succeededCount} succeeded, ${failedCount} failed. Check the server logs for details.`,
      );
    } else {
      toastSuccess(options.successMessage(succeededCount));
    }

    options.onSuccess?.();
    return result;
  } catch (error) {
    dismissToast(loadingId);
    toastError(error instanceof Error ? error.message : "Bulk action failed.");
    throw error;
  }
}

export async function fetchScreenerExportRows(leadIds?: string[]) {
  const query =
    leadIds && leadIds.length > 0
      ? `?lead_ids=${encodeURIComponent(leadIds.join(","))}`
      : "";
  const response = await fetch(`/api/admin/screener-responses/export${query}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Export failed.");
  }

  return payload.rows as Record<string, string | number>[];
}

