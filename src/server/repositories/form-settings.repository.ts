import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-templates/defaults";
import {
  MESSAGE_TEMPLATE_KEYS,
  resolveWhatsAppSubmissionConfirmationKey,
} from "@/lib/message-templates/keys";
import type {
  MessageTemplate,
  MessageTemplatesRecord,
  MessageTemplateChannel,
} from "@/lib/message-templates/types";
import { mergeStudyConfig } from "@/lib/study-config/parse";
import type { StudyConfig } from "@/lib/study-config/types";
import {
  ensureDefaultMessageTemplatesInTable,
  getMessageTemplatesFromTable,
  replaceMessageTemplatesInTable,
} from "@/server/repositories/message-templates.repository";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/** Study-wide settings live on the registration form_settings row. */
export const STUDY_SETTINGS_FORM_TYPE = "registration";

function isMessageTemplateChannel(value: unknown): value is MessageTemplateChannel {
  return value === "whatsapp" || value === "instagram";
}

function parseMessageTemplate(value: unknown): MessageTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const channel = record.channel;
  const enabled = record.enabled;
  const template =
    typeof record.template === "string" ? record.template : "";

  if (!title || !isMessageTemplateChannel(channel)) return null;

  return {
    title,
    channel,
    enabled: typeof enabled === "boolean" ? enabled : true,
    template,
  };
}

export function parseMessageTemplatesRecord(
  raw: unknown,
): MessageTemplatesRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const parsed: MessageTemplatesRecord = {};
  for (const [key, value] of Object.entries(raw)) {
    const template = parseMessageTemplate(value);
    if (template) parsed[key] = template;
  }
  return parsed;
}

export function mergeMessageTemplates(
  stored: MessageTemplatesRecord,
): MessageTemplatesRecord {
  if (Object.keys(stored).length === 0) {
    return { ...DEFAULT_MESSAGE_TEMPLATES };
  }
  const merged: MessageTemplatesRecord = {
    ...DEFAULT_MESSAGE_TEMPLATES,
    ...stored,
  };
  const official = MESSAGE_TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION;
  if (!stored[official]) {
    const aliasKey = resolveWhatsAppSubmissionConfirmationKey(stored);
    if (stored[aliasKey]) {
      merged[official] = stored[aliasKey];
    }
  }
  return merged;
}

function isMissingColumn(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42703" || error.code === "PGRST204")
  );
}

function isMissingMessageTemplatesColumn(error: unknown) {
  return isMissingColumn(error);
}

function isMissingStudyConfigColumn(error: unknown) {
  return isMissingColumn(error);
}

export async function getMessageTemplates(): Promise<MessageTemplatesRecord> {
  try {
    const fromTable = await getMessageTemplatesFromTable();
    if (Object.keys(fromTable).length > 0) {
      return mergeMessageTemplates(fromTable);
    }
    const seeded = await ensureDefaultMessageTemplatesInTable();
    if (Object.keys(seeded).length > 0) {
      return mergeMessageTemplates(seeded);
    }
  } catch {
    // Fall through to JSONB legacy storage.
  }

  const { data, error } = await getSupabaseAdmin()
    .from("form_settings")
    .select("message_templates")
    .eq("form_type", STUDY_SETTINGS_FORM_TYPE)
    .maybeSingle();

  if (error) {
    if (isMissingMessageTemplatesColumn(error)) {
      return mergeMessageTemplates({});
    }
    throw error;
  }

  const stored = parseMessageTemplatesRecord(data?.message_templates);
  return mergeMessageTemplates(stored);
}

export async function updateMessageTemplates(
  templates: MessageTemplatesRecord,
): Promise<MessageTemplatesRecord> {
  try {
    await replaceMessageTemplatesInTable(templates);
    return templates;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "MESSAGE_TEMPLATES_MIGRATION_PENDING"
    ) {
      throw error;
    }
  }

  const { data: settings, error: settingsError } = await getSupabaseAdmin()
    .from("form_settings")
    .select("id")
    .eq("form_type", STUDY_SETTINGS_FORM_TYPE)
    .maybeSingle();

  if (settingsError) throw settingsError;

  const payload = {
    message_templates: templates as unknown as Json,
  };

  if (settings?.id) {
    const { error } = await getSupabaseAdmin()
      .from("form_settings")
      .update(payload)
      .eq("id", settings.id);

    if (error) {
      if (isMissingMessageTemplatesColumn(error)) {
        throw new Error("MESSAGE_TEMPLATES_MIGRATION_PENDING");
      }
      throw error;
    }
    return templates;
  }

  const { error } = await getSupabaseAdmin()
    .from("form_settings")
    .insert({
      form_type: STUDY_SETTINGS_FORM_TYPE,
      active_version: 1,
      ...payload,
    });

  if (error) {
    if (isMissingMessageTemplatesColumn(error)) {
      throw new Error("MESSAGE_TEMPLATES_MIGRATION_PENDING");
    }
    throw error;
  }

  return templates;
}

export function getEnabledMessageTemplates(
  templates: MessageTemplatesRecord,
): MessageTemplatesRecord {
  return Object.fromEntries(
    Object.entries(templates).filter(([, template]) => template.enabled),
  );
}

export async function getStudyConfig(): Promise<StudyConfig> {
  const { data, error } = await getSupabaseAdmin()
    .from("form_settings")
    .select("study_config")
    .eq("form_type", STUDY_SETTINGS_FORM_TYPE)
    .maybeSingle();

  if (error) {
    if (isMissingStudyConfigColumn(error)) {
      return mergeStudyConfig({});
    }
    throw error;
  }

  return mergeStudyConfig(
    (data as { study_config?: unknown } | null)?.study_config,
  );
}

export async function updateStudyConfig(
  config: StudyConfig,
): Promise<StudyConfig> {
  const next = mergeStudyConfig(config);

  const { data: settings, error: settingsError } = await getSupabaseAdmin()
    .from("form_settings")
    .select("id")
    .eq("form_type", STUDY_SETTINGS_FORM_TYPE)
    .maybeSingle();

  if (settingsError) throw settingsError;

  const payload = {
    study_config: next as unknown as Json,
  };

  if (settings?.id) {
    const { error } = await getSupabaseAdmin()
      .from("form_settings")
      .update(payload)
      .eq("id", settings.id);

    if (error) {
      if (isMissingStudyConfigColumn(error)) {
        throw new Error("STUDY_CONFIG_MIGRATION_PENDING");
      }
      throw error;
    }
    return next;
  }

  const { error } = await getSupabaseAdmin()
    .from("form_settings")
    .insert({
      form_type: STUDY_SETTINGS_FORM_TYPE,
      active_version: 1,
      ...payload,
    });

  if (error) {
    if (isMissingStudyConfigColumn(error)) {
      throw new Error("STUDY_CONFIG_MIGRATION_PENDING");
    }
    throw error;
  }

  return next;
}
