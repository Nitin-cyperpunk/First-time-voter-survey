import { FormManagement } from "@/components/admin/form-management";
import type { FormVersionRow } from "@/components/admin/form-versions-table";
import { FORM_TYPE_LABELS } from "@/lib/forms/types";
import {
  getActiveVersionNumber,
  listFormVersions,
  type FormVersionAdminRow,
} from "@/server/repositories/forms.repository";

export const dynamic = "force-dynamic";

function isMissingFormTypesMigration(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42703" || error.code === "PGRST204")
  );
}

export default async function FormsPage() {
  try {
    const [forms, activeVersion] = await Promise.all([
      listFormVersions("registration"),
      getActiveVersionNumber("registration"),
    ]);
    const rows: FormVersionRow[] = (forms as FormVersionAdminRow[]).map(
      (form) => ({
      version: form.version,
      name: form.name ?? `${FORM_TYPE_LABELS.registration} v${form.version}`,
      sourceLabel: form.hasHtmlContent
        ? form.uploadedFileName ?? "Uploaded HTML"
        : form.htmlFilePath ?? "—",
      previewPath: `/api/admin/forms/${form.version}/preview?formType=registration`,
      hasHtmlContent: form.hasHtmlContent,
      published: form.published,
      isActive: form.version === activeVersion,
    }),
    );

    return (
      <FormManagement
        forms={rows}
        activeForm={rows.find((row) => row.isActive) ?? null}
      />
    );
  } catch (error) {
    if (!isMissingFormTypesMigration(error)) {
      throw error;
    }

    return (
      <div className="rounded-[10px] border border-border border-l-4 border-l-rose bg-rose-tint p-6 text-sm text-plum-muted">
        <p className="font-medium">Form types migration is pending.</p>
        <p className="mt-2">
          Run{" "}
          <span className="font-mono text-xs">
            supabase/migrations/001_core_schema.sql
          </span>{" "}
          through{" "}
          <span className="font-mono text-xs">007_study_config.sql</span> in
          Supabase SQL Editor, then refresh this page.
        </p>
      </div>
    );
  }
}
