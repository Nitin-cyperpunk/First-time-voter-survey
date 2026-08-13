import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { coerceFormExportSchema, parseFormExportSchemaFromHtml } from "@/lib/form-export";
import type { FormExportSchema } from "@/lib/form-export/types";
import { loadBundledActiveForm, resolveActiveFormHtml } from "@/lib/forms/bundled-form-fallback";
import { parseFormType, type FormType } from "@/lib/forms/types";

export type FormVersionAdminRow = {
  id: string;
  formType: FormType;
  version: number;
  name: string | null;
  htmlFilePath: string | null;
  htmlContent: string | null;
  uploadedFileName: string | null;
  hasHtmlContent: boolean;
  published: boolean;
  createdAt: Date;
};

export type ActiveFormVersion = {
  formType: FormType;
  version: number;
  name: string | null;
  htmlFilePath: string | null;
  htmlContent: string | null;
  uploadedFileName: string | null;
  schema: FormExportSchema;
};

function mapFormVersion(row: {
  id: string;
  form_type: string;
  version: number;
  name: string | null;
  html_file_path: string | null;
  html_content: string | null;
  uploaded_file_name: string | null;
  published: boolean;
  created_at: string;
}): FormVersionAdminRow {
  return {
    id: row.id,
    formType: parseFormType(row.form_type),
    version: row.version,
    name: row.name,
    htmlFilePath: row.html_file_path,
    htmlContent: row.html_content,
    uploadedFileName: row.uploaded_file_name,
    hasHtmlContent: Boolean(row.html_content),
    published: row.published,
    createdAt: new Date(row.created_at),
  };
}

function hasPreviewableHtml(row: {
  html_content: string | null;
  html_file_path: string | null;
}) {
  return Boolean(
    row.html_content ||
      (row.html_file_path && row.html_file_path.startsWith("/forms/")),
  );
}

export async function listFormVersions(formType: FormType) {
  const { data, error } = await getSupabaseAdmin()
    .from("form_versions")
    .select(
      "id, form_type, version, name, html_file_path, html_content, uploaded_file_name, published, created_at",
    )
    .eq("form_type", formType)
    .order("version", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapFormVersion);
}

export async function getActiveVersionNumber(formType: FormType) {
  const { data, error } = await getSupabaseAdmin()
    .from("form_settings")
    .select("active_version")
    .eq("form_type", formType)
    .maybeSingle();

  if (error) throw error;
  return data?.active_version ?? 1;
}

export async function getActivePublishedForm(formType: FormType) {
  const activeVersion = await getActiveVersionNumber(formType);

  const { data, error } = await getSupabaseAdmin()
    .from("form_versions")
    .select("*")
    .eq("form_type", formType)
    .eq("version", activeVersion)
    .eq("published", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return loadBundledActiveForm(formType);
  }

  return resolveActiveFormHtml({
    formType: data.form_type as FormType,
    version: data.version,
    name: data.name ?? null,
    htmlFilePath: data.html_file_path ?? null,
    htmlContent: data.html_content ?? null,
    uploadedFileName: data.uploaded_file_name ?? null,
    schemaFromDb: data.schema,
  });
}

export async function setActiveFormVersion(formType: FormType, version: number) {
  const { data: formVersion, error: versionError } = await getSupabaseAdmin()
    .from("form_versions")
    .select("version, published, html_file_path, html_content")
    .eq("form_type", formType)
    .eq("version", version)
    .maybeSingle();

  if (versionError) throw versionError;
  if (!formVersion) throw new Error("FORM_VERSION_NOT_FOUND");
  if (!formVersion.published) throw new Error("FORM_VERSION_NOT_PUBLISHED");
  if (!hasPreviewableHtml(formVersion)) {
    throw new Error("INVALID_HTML_FILE_PATH");
  }

  const { data: settings, error: settingsError } = await getSupabaseAdmin()
    .from("form_settings")
    .select("id")
    .eq("form_type", formType)
    .maybeSingle();

  if (settingsError) throw settingsError;

  if (settings?.id) {
    const { error } = await getSupabaseAdmin()
      .from("form_settings")
      .update({ active_version: version })
      .eq("id", settings.id);

    if (error) throw error;
    return;
  }

  const { error } = await getSupabaseAdmin()
    .from("form_settings")
    .insert({ form_type: formType, active_version: version });

  if (error) throw error;
}

export async function setFormVersionPublished(
  formType: FormType,
  version: number,
  published: boolean,
) {
  const { data: formVersion, error: versionError } = await getSupabaseAdmin()
    .from("form_versions")
    .select("version, html_file_path, html_content")
    .eq("form_type", formType)
    .eq("version", version)
    .maybeSingle();

  if (versionError) throw versionError;
  if (!formVersion) throw new Error("FORM_VERSION_NOT_FOUND");
  if (published && !hasPreviewableHtml(formVersion)) {
    throw new Error("INVALID_HTML_FILE_PATH");
  }

  const { error } = await getSupabaseAdmin()
    .from("form_versions")
    .update({ published })
    .eq("form_type", formType)
    .eq("version", version);

  if (error) throw error;

  if (!published) {
    const activeVersion = await getActiveVersionNumber(formType);
    if (activeVersion === version) {
      const { data: fallback } = await getSupabaseAdmin()
        .from("form_versions")
        .select("version")
        .eq("form_type", formType)
        .eq("published", true)
        .neq("version", version)
        .order("version", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallback) {
        await setActiveFormVersion(formType, fallback.version);
      }
    }
  }
}

export async function createUploadedFormVersion(
  formType: FormType,
  input: {
    name: string;
    htmlContent: string;
    uploadedFileName: string;
  },
) {
  const { data: latest, error: latestError } = await getSupabaseAdmin()
    .from("form_versions")
    .select("version")
    .eq("form_type", formType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  const nextVersion = (latest?.version ?? 0) + 1;
  const schema = parseFormExportSchemaFromHtml(input.htmlContent, {
    excludeCoreFields: formType === "registration",
  });
  const { data, error } = await getSupabaseAdmin()
    .from("form_versions")
    .insert({
      form_type: formType,
      version: nextVersion,
      name: input.name.trim(),
      html_file_path: null,
      html_content: input.htmlContent,
      uploaded_file_name: input.uploadedFileName,
      schema,
      published: false,
    })
    .select(
      "id, form_type, version, name, html_file_path, html_content, uploaded_file_name, published, created_at",
    )
    .single();

  if (error) throw error;
  return mapFormVersion(data);
}

export async function getFormVersionForPreview(
  formType: FormType,
  version: number,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("form_versions")
    .select(
      "id, form_type, version, name, html_file_path, html_content, uploaded_file_name, published, created_at",
    )
    .eq("form_type", formType)
    .eq("version", version)
    .maybeSingle();

  if (error) throw error;
  return data ? mapFormVersion(data) : null;
}
