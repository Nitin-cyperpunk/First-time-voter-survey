import { FormManagement } from "@/components/admin/form-management";
import type { FormVersionRow } from "@/components/admin/form-versions-table";
import {
  FORM_TYPE_LABELS,
  FORM_TYPES,
  type FormType,
} from "@/lib/forms/types";
import {
  getActiveVersionNumber,
  listFormVersions,
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

function toRows(
  forms: Awaited<ReturnType<typeof listFormVersions>>,
  activeVersion: number,
  formType: FormType,
): FormVersionRow[] {
  return forms.map((form) => ({
    version: form.version,
    name: form.name ?? `${FORM_TYPE_LABELS[formType]} v${form.version}`,
    sourceLabel: form.hasHtmlContent
      ? form.uploadedFileName ?? "Uploaded HTML"
      : form.htmlFilePath ?? "—",
    previewPath: `/api/admin/forms/${form.version}/preview?formType=${formType}`,
    hasHtmlContent: form.hasHtmlContent,
    published: form.published,
    isActive: form.version === activeVersion,
  }));
}

export default async function FormsPage() {
  let migrationMissing = false;
  const panels = {} as Record<
    FormType,
    { forms: FormVersionRow[]; activeForm: FormVersionRow | null }
  >;

  try {
    for (const formType of FORM_TYPES) {
      const [forms, activeVersion] = await Promise.all([
        listFormVersions(formType),
        getActiveVersionNumber(formType),
      ]);
      const rows = toRows(forms, activeVersion, formType);
      panels[formType] = {
        forms: rows,
        activeForm: rows.find((row) => row.isActive) ?? null,
      };
    }
  } catch (error) {
    if (!isMissingFormTypesMigration(error)) {
      throw error;
    }
    migrationMissing = true;
  }

  if (migrationMissing) {
    return (
      <div className="rounded-[10px] border border-border border-l-4 border-l-rose bg-rose-tint p-6 text-sm text-plum-muted">
        <p className="font-medium">Form types migration is pending.</p>
        <p className="mt-2">
          Run{" "}
          <span className="font-mono text-xs">
            supabase/migrations/016_form_types.sql
          </span>{" "}
          in Supabase SQL Editor, then refresh this page.
        </p>
      </div>
    );
  }

  return <FormManagement panels={panels} />;
}
