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
      <div className="rounded-[14px] border border-primary/20 bg-accent-soft p-5 shadow-sm">
        <h2 className="text-[17px] font-bold leading-snug text-text-primary sm:text-[18px]">
          🎉 You&apos;re selected!
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-text-body sm:text-base">
          Great news — you qualified <strong>for the study</strong>. One quick
          step: message us on Instagram to verify, and we&apos;ll send your
          survey link there.
        </p>
      </div>

      <button
        type="button"
        disabled={preparing}
        onClick={onInstagramClick}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-[15px] font-bold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted disabled:opacity-100 sm:text-[16px]"
      >
        {preparing ? (
          <span className="font-semibold">Preparing message...</span>
        ) : (
          "Message us on Instagram"
        )}
        {!preparing ? <ArrowRightIcon className="size-4 shrink-0" /> : null}
      </button>

      <p className="text-center text-[13px] leading-relaxed text-text-muted sm:text-[13.5px]">
        <strong className="font-bold text-text-muted">
          Preparing you for the next step:
        </strong>{" "}
        we&apos;ll copy your message automatically, then open Instagram.
      </p>
    </div>
  );
}
