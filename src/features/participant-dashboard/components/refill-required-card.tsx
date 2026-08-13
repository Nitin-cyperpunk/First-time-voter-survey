import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/features/participant-dashboard/components/dashboard-layout";

export function RefillRequiredCard() {
  return (
    <DashboardLayout>
      <div className="rounded-[14px] border border-[#EAD9B8] bg-[#F7EEDB] p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          Registration Update Required
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-plum-muted">
          Please review and resubmit your registration details. Your phone
          number cannot be changed. Other basic details and the form can be
          updated.
        </p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/refill">Refill Registration</Link>
        </Button>
      </div>
    </DashboardLayout>
  );
}
