"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";
import type { FormType } from "@/lib/forms/types";

export type FormVersionRow = {
  version: number;
  name: string;
  sourceLabel: string;
  previewPath: string;
  hasHtmlContent: boolean;
  published: boolean;
  isActive: boolean;
};

type FormVersionsTableProps = {
  formType: FormType;
  forms: FormVersionRow[];
};

function formatActionError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Action failed. Please try again.";
}

function successMessageForAction(key: string, published?: boolean) {
  if (key.endsWith(":active")) {
    return "✅ Status Updated Successfully";
  }

  if (key.endsWith(":publish")) {
    return published
      ? "🚀 Form Published Successfully"
      : "✅ Status Updated Successfully";
  }

  return "✅ Status Updated Successfully";
}

export function FormVersionsTable({ formType, forms }: FormVersionsTableProps) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function runAction(
    key: string,
    request: () => Promise<Response>,
    options?: { published?: boolean },
  ) {
    setPendingKey(key);
    const loadingId = toastLoading("Updating form...");

    try {
      const response = await request();
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Action failed.");
      }

      dismissToast(loadingId);
      toastSuccess(successMessageForAction(key, options?.published));
      router.refresh();
    } catch (err) {
      dismissToast(loadingId);
      toastError(formatActionError(err));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No form versions found. Run migration 003 in Supabase.
                </TableCell>
              </TableRow>
            ) : (
              forms.map((form) => {
                const busy = pendingKey?.startsWith(`${form.version}:`) ?? false;

                return (
                  <TableRow key={form.version}>
                    <TableCell className="font-medium">v{form.version}</TableCell>
                    <TableCell>{form.name}</TableCell>
                    <TableCell>
                      <a
                        href={form.previewPath}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-plum-muted hover:text-foreground"
                      >
                        <span className="font-mono text-xs">{form.sourceLabel}</span>
                        <ExternalLink className="size-3.5" />
                      </a>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {form.hasHtmlContent ? "Database upload" : "Static file"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {form.isActive ? (
                          <StatusPill variant="eligible">Active</StatusPill>
                        ) : null}
                        <StatusPill variant={form.published ? "completed" : "notEligible"}>
                          {form.published ? "Published" : "Unpublished"}
                        </StatusPill>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {form.published && !form.isActive ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              runAction(`${form.version}:active`, () =>
                                fetch("/api/admin/forms/active", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    formType,
                                    version: form.version,
                                  }),
                                }),
                              )
                            }
                          >
                            Set active
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || (form.isActive && form.published)}
                          onClick={() =>
                            runAction(
                              `${form.version}:publish`,
                              () =>
                                fetch("/api/admin/forms/publish", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    formType,
                                    version: form.version,
                                    published: !form.published,
                                  }),
                                }),
                              { published: !form.published },
                            )
                          }
                        >
                          {form.published ? "Unpublish" : "Publish"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
