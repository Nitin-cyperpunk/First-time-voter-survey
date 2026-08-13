import { DashboardLogoutButton } from "@/features/participant-dashboard/components/dashboard-logout-button";

type DashboardHeaderProps = {
  fullName: string;
};

export function DashboardHeader({ fullName }: DashboardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Hi {fullName} 👋
        </h1>
      </div>
      <DashboardLogoutButton className="shrink-0" />
    </div>
  );
}
