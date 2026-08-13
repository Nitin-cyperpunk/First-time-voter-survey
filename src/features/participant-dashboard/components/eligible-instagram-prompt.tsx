"use client";

import { ArrowRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EligibleInstagramPromptProps = {
  preparing?: boolean;
  onInstagramClick: () => void;
  className?: string;
};

export function EligibleInstagramPrompt({
  preparing = false,
  onInstagramClick,
  className,
}: EligibleInstagramPromptProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-[14px] border border-[#C9E5DE] bg-[#E2F0EC] p-5 shadow-sm">
        <h2 className="text-[17px] font-bold leading-snug text-[#2E8B6F] sm:text-[18px]">
          🎉 You&apos;re selected!
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-[#3E8E7E] sm:text-base">
          Great news — you qualified <strong>for the study</strong>. One quick
          step: message us on Instagram to verify, and we&apos;ll send your
          survey link there.
        </p>
      </div>

      <button
        type="button"
        disabled={preparing}
        onClick={onInstagramClick}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C13584] via-[#E1306C] to-[#F77737] px-5 py-4 text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.35)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60 sm:text-[16px]"
      >
        {preparing ? (
          <span className="font-semibold">Preparing message...</span>
        ) : (
          "Message us on Instagram"
        )}
        {!preparing ? <ArrowRightIcon className="size-4 shrink-0" /> : null}
      </button>

      <p className="text-center text-[13px] leading-relaxed text-[#9A8F98] sm:text-[13.5px]">
        <strong className="font-bold text-[#7A6E78]">
          Preparing you for the next step:
        </strong>{" "}
        we&apos;ll copy your message automatically, then open Instagram.
      </p>
    </div>
  );
}
