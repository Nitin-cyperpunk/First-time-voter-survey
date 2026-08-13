import { MetricsDashboard } from "@/components/admin/metrics-dashboard";
import { getDashboardMetrics } from "@/features/respondents/lib/dashboard-metrics";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const metrics = await getDashboardMetrics();
  return <MetricsDashboard initialMetrics={metrics} />;
}
