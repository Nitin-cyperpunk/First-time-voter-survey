"use client";

import { useMemo } from "react";

import { renderMessageTemplate } from "@/lib/message-templates/render-template";
import type { TemplateContext } from "@/lib/message-templates/types";
import type { NormalizedMessageTemplate } from "@/features/message-templates/lib/normalize-templates";

type TemplatePreviewProps = {
  template: NormalizedMessageTemplate | null;
  context: TemplateContext;
  emptyMessage?: string;
};

export function TemplatePreview({
  template,
  context,
  emptyMessage = "Select a template to preview the message.",
}: TemplatePreviewProps) {
  const rendered = useMemo(() => {
    if (!template?.body) return "";
    return renderMessageTemplate(template.body, context);
  }, [template, context]);

  return (
    <div className="rounded-[14px] border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-plum-muted">
        Preview
      </p>
      <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
        {rendered || emptyMessage}
      </pre>
    </div>
  );
}
