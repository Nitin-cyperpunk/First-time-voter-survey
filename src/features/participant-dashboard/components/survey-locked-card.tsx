import { LockIcon } from "lucide-react";

export function SurveyLockedCard() {
  return (
    <div className="rounded-[14px] border border-[#F0C7C7] bg-[#F6E3E3] p-6 shadow-sm">
      <div className="flex items-center gap-2 text-[#8D3D3D]">
        <LockIcon className="size-5 shrink-0" />
        <h2 className="text-base font-semibold">Survey Locked</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#8D3D3D]">
        The main survey is not available for your account.
      </p>
    </div>
  );
}
