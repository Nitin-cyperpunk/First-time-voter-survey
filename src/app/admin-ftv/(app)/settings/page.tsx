import { StudyConfigSettings } from "@/components/admin/study-config-settings";
import { requireCapability } from "@/lib/auth/admin-session";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";
import { countDeliverableClean } from "@/server/repositories/deliverable-clean.repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireCapability("settings");
  const [config, cleanCount] = await Promise.all([
    getStudyConfig(),
    countDeliverableClean(),
  ]);

  return (
    <StudyConfigSettings
      initialConfig={config}
      initialCleanCount={cleanCount}
    />
  );
}
