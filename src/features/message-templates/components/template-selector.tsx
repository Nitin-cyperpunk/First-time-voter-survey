"use client";

import type { MessageTemplateChannel } from "@/lib/message-templates/types";
import type { NormalizedMessageTemplate } from "@/features/message-templates/lib/normalize-templates";

type TemplateSelectorProps = {
  channel: MessageTemplateChannel;
  templateId: string | null;
  templates: NormalizedMessageTemplate[];
  onChannelChange: (channel: MessageTemplateChannel) => void;
  onTemplateChange: (templateId: string) => void;
  disabled?: boolean;
};

const CHANNEL_OPTIONS: { value: MessageTemplateChannel; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
];

export function TemplateSelector({
  channel,
  templateId,
  templates,
  onChannelChange,
  onTemplateChange,
  disabled = false,
}: TemplateSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-plum-muted">
          Choose Channel
        </span>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={channel}
          disabled={disabled}
          onChange={(event) =>
            onChannelChange(event.target.value as MessageTemplateChannel)
          }
        >
          {CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-plum-muted">
          Choose Template
        </span>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={templateId ?? ""}
          disabled={disabled || templates.length === 0}
          onChange={(event) => onTemplateChange(event.target.value)}
        >
          {templates.length === 0 ? (
            <option value="">No templates for this channel</option>
          ) : (
            templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );
}
