import { extractTemplateVariables } from "@/lib/message-templates/extract-variables";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-templates/defaults";
import type {
  MessageTemplate,
  MessageTemplateChannel,
  MessageTemplatesRecord,
} from "@/lib/message-templates/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MessageTemplateRow = {
  id: string;
  name: string;
  channel: MessageTemplateChannel;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function isMissingTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42P01" || error.code === "PGRST205")
  );
}

function rowToTemplate(row: MessageTemplateRow): MessageTemplate {
  return {
    title: row.name,
    channel: row.channel,
    enabled: row.is_active,
    template: row.body,
  };
}

function templateToRow(id: string, template: MessageTemplate): Omit<MessageTemplateRow, "created_at" | "updated_at"> {
  return {
    id,
    name: template.title.trim(),
    channel: template.channel,
    body: template.template,
    variables: extractTemplateVariables(template.template),
    is_active: template.enabled,
  };
}

export function rowsToRecord(rows: MessageTemplateRow[]): MessageTemplatesRecord {
  const record: MessageTemplatesRecord = {};
  for (const row of rows) {
    record[row.id] = rowToTemplate(row);
  }
  return record;
}

export async function listMessageTemplateRows(): Promise<MessageTemplateRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("message_templates")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  return (data ?? []) as MessageTemplateRow[];
}

export async function getMessageTemplatesFromTable(): Promise<MessageTemplatesRecord> {
  const rows = await listMessageTemplateRows();
  if (rows.length === 0) return {};
  return rowsToRecord(rows);
}

export async function replaceMessageTemplatesInTable(
  templates: MessageTemplatesRecord,
): Promise<MessageTemplatesRecord> {
  const rows = Object.entries(templates).map(([id, template]) =>
    templateToRow(id, template),
  );

  const { error: deleteError } = await getSupabaseAdmin()
    .from("message_templates")
    .delete()
    .neq("id", "");

  if (deleteError) {
    if (isMissingTable(deleteError)) {
      throw new Error("MESSAGE_TEMPLATES_MIGRATION_PENDING");
    }
    throw deleteError;
  }

  if (rows.length > 0) {
    const now = new Date().toISOString();
    const payload = rows.map((row) => ({
      ...row,
      updated_at: now,
      created_at: now,
    }));

    const { error: insertError } = await getSupabaseAdmin()
      .from("message_templates")
      .insert(payload);

    if (insertError) {
      if (isMissingTable(insertError)) {
        throw new Error("MESSAGE_TEMPLATES_MIGRATION_PENDING");
      }
      throw insertError;
    }
  }

  return templates;
}

export async function ensureDefaultMessageTemplatesInTable(): Promise<MessageTemplatesRecord> {
  const existing = await getMessageTemplatesFromTable();
  if (Object.keys(existing).length > 0) return existing;
  return replaceMessageTemplatesInTable({ ...DEFAULT_MESSAGE_TEMPLATES });
}
