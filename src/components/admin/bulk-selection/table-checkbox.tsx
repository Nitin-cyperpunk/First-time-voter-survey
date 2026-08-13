"use client";

import { memo, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type TableCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
  className?: string;
};

export const TableCheckbox = memo(function TableCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  ariaLabel,
  className,
}: TableCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === " ") {
          event.stopPropagation();
        }
      }}
      className={cn(
        "size-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
});
