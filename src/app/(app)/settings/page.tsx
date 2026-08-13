import { StudyConfigSettings } from "@/components/admin/study-config-settings";
import { requireCapability } from "@/lib/auth/admin-session";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireCapability("settings");
  const config = await getStudyConfig();

  return <StudyConfigSettings initialConfig={config} />;
}
