import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ConfigAuditEntityType =
  | "study_config"
  | "city"
  | "state_quota"
  | "quota_reallocation"
  | "city_import"
  | "city_alias"
  | "city_unmatched_resolve";

export type ConfigAuditEntry = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  entityType: ConfigAuditEntityType;
  entityId: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export async function logConfigChange(input: {
  actorId?: string | null;
  actorEmail?: string | null;
  entityType: ConfigAuditEntityType;
  entityId?: string | null;
  field: string;
  oldValue: string | number | boolean | null | undefined;
  newValue: string | number | boolean | null | undefined;
}) {
  if (String(input.oldValue ?? "") === String(input.newValue ?? "")) return;

  const { error } = await getSupabaseAdmin().from("config_audit_log").insert({
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    field: input.field,
    old_value: input.oldValue == null ? null : String(input.oldValue),
    new_value: input.newValue == null ? null : String(input.newValue),
  });

  if (error) throw error;
}

export async function listConfigAuditLog(limit = 100): Promise<ConfigAuditEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("config_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    actor_id: string | null;
    actor_email: string | null;
    entity_type: string;
    entity_id: string | null;
    field: string;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    entityType:
      row.entity_type === "city" ||
      row.entity_type === "state_quota" ||
      row.entity_type === "quota_reallocation" ||
      row.entity_type === "city_import" ||
      row.entity_type === "city_alias" ||
      row.entity_type === "city_unmatched_resolve"
        ? row.entity_type
        : "study_config",
    entityId: row.entity_id,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  }));
}
