"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";

import type { FormType } from "@/lib/forms/types";
import { FORM_TYPE_LABELS } from "@/lib/forms/types";

export function FormUploadCard({ formType }: { formType: FormType }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!file) {
      toastError("Choose an HTML file to upload.");
      return;
    }

    const payload = new FormData();
    payload.set("formType", formType);
    payload.set("name", name);
    payload.set("file", file);
    setUploading(true);

    const loadingId = toastLoading("Uploading form...");

    try {
      const response = await fetch("/api/admin/forms/upload", {
        method: "POST",
        body: payload,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      dismissToast(loadingId);
      toastSuccess("✅ Status Updated Successfully", {
        description: `Uploaded draft v${data.version}. Preview, publish, then set active.`,
      });
      setName("");
      setFile(null);
      router.refresh();
    } catch (err) {
      dismissToast(loadingId);
      toastError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[14px] border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">
            Upload {FORM_TYPE_LABELS[formType]} HTML
          </h3>
          <p className="mt-1 text-sm text-plum-muted">
            Creates an unpublished draft version. Preview it, publish it, then
            set it active.
          </p>
        </div>

        <div className="w-full lg:w-64">
          <label htmlFor="form-name" className="text-sm font-semibold text-plum-muted">
            Form name
          </label>
          <Input
            id="form-name"
            className="mt-1 bg-card"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Apparel Choice V3"
            required
          />
        </div>

        <div className="w-full lg:w-72">
          <label htmlFor="form-file" className="text-sm font-semibold text-plum-muted">
            HTML file
          </label>
          <Input
            id="form-file"
            type="file"
            accept=".html,text/html"
            className="mt-1 bg-card"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
        </div>

        <Button type="submit" disabled={uploading}>
          {uploading ? "Uploading..." : "Upload draft"}
        </Button>
      </div>
    </form>
  );
}
