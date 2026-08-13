import {
  buildResponseExportArtifacts,
  coerceFormExportSchema,
  mergeExportSchemas,
  parseFormExportSchemaFromHtml,
  type FormExportSchema,
  type NormalizedExportMap,
} from "@/lib/form-export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";

type FormVersionRecord = {
  version: number;
  html_content: string | null;
  schema: unknown;
  form_type: string;
};

export async function getPublishedFormVersion(
  formType: "registration" | "survey",
  version: number,
): Promise<FormVersionRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("form_versions")
    .select("version, html_content, schema, form_type")
    .eq("form_type", formType)
    .eq("version", version)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function resolveSchemaForFormVersion(
  record: FormVersionRecord | null,
): FormExportSchema {
  if (!record) return { version: 1, fields: [] };

  if (record.html_content) {
    const parsed = parseFormExportSchemaFromHtml(record.html_content, {
      excludeCoreFields: record.form_type === "registration",
    });
    if (parsed.fields.length > 0) return parsed;
  }

  return coerceFormExportSchema(record.schema);
}

export function resolveNormalizedExport(input: {
  stored: unknown;
  answers: Record<string, unknown>;
  schema: FormExportSchema;
  html?: string | null;
  leadId: string;
  metadata?: Record<string, string | number>;
  excludeCoreFields?: boolean;
}): NormalizedExportMap {
  return buildResponseExportArtifacts({
    schema: input.schema,
    html: input.html,
    answers: input.answers,
    leadId: input.leadId,
    metadata: input.metadata,
    excludeCoreFields: input.excludeCoreFields,
  }).normalizedExport;
}

export async function getActiveRegistrationExportSchema(): Promise<FormExportSchema> {
  const active = await getActivePublishedForm("registration");
  if (!active) return { version: 1, fields: [] };
  return coerceFormExportSchema(active.schema);
}

export async function loadSchemasForVersions(
  formType: "registration" | "survey",
  versions: number[],
): Promise<Map<number, FormExportSchema>> {
  const uniqueVersions = [...new Set(versions.filter((value) => value > 0))];
  const map = new Map<number, FormExportSchema>();

  await Promise.all(
    uniqueVersions.map(async (version) => {
      const record = await getPublishedFormVersion(formType, version);
      map.set(version, resolveSchemaForFormVersion(record));
    }),
  );

  return map;
}

export function mergeSchemasFromMap(
  schemaByVersion: Map<number, FormExportSchema>,
): FormExportSchema {
  return mergeExportSchemas([...schemaByVersion.values()]);
}
