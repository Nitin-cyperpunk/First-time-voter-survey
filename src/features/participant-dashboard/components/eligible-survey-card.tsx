import Link from "next/link";

import { Button } from "@/components/ui/button";

type EligibleSurveyCardProps = {
  surveyUrl: string;
};

export function EligibleSurveyCard({ surveyUrl }: EligibleSurveyCardProps) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <Button asChild className="w-full" size="lg">
        <Link href={surveyUrl}>Start Survey</Link>
      </Button>
    </div>
  );
}
