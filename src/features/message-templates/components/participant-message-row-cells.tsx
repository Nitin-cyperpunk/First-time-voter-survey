"use client";

import { useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { useParticipantRowMessaging } from "@/features/message-templates/hooks/use-participant-row-messaging";
import {
  buildParticipantTemplateContext,
  type NormalizedMessageTemplate,
  type ParticipantTemplateSource,
} from "@/features/message-templates/lib/normalize-templates";
import {
  loadParticipantMessagePrefs,
  saveParticipantMessagePrefs,
} from "@/features/message-templates/lib/participant-message-prefs";
import {
  renderParticipantMessage,
  sendAdminParticipantMessage,
} from "@/lib/admin-participant-messaging";
import type { MessageTemplateChannel } from "@/lib/message-templates/types";
import { formatAdminDate } from "@/lib/format-admin-datetime";
import { toastError } from "@/lib/toast";

const CHANNEL_OPTIONS: { value: MessageTemplateChannel; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
];

const selectClassName =
  "w-full min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground";

type ParticipantMessageRowCellsProps = {
  leadId: string;
  participant: ParticipantTemplateSource;
  templates: NormalizedMessageTemplate[];
  templatesLoading?: boolean;
};

export function ParticipantMessageRowCells({
  leadId,
  participant,
  templates,
  templatesLoading = false,
}: ParticipantMessageRowCellsProps) {
  const {
    channel,
    setChannel,
    templateId,
    setTemplateId,
    channelTemplates,
    selectedTemplate,
  } = useParticipantRowMessaging(leadId, templates);

  const [sending, setSending] = useState(false);
  const sendingLockRef = useRef(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(
    () => loadParticipantMessagePrefs(leadId).last_sent_at ?? null,
  );

  const context = useMemo(
    () => buildParticipantTemplateContext(participant),
    [participant],
  );

  function recordSentPrefs() {
    if (!selectedTemplate) return;
    const sentAt = new Date().toISOString();
    saveParticipantMessagePrefs(leadId, {
      preferred_channel: channel,
      last_template_used: selectedTemplate.id,
      last_sent_at: sentAt,
    });
    setLastSentAt(sentAt);
  }

  async function handleSend(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (sendingLockRef.current) return;

    if (!selectedTemplate) {
      toastError("Select a template first.");
      return;
    }

    sendingLockRef.current = true;
    setSending(true);
    try {
      if (channel === "instagram") {
        const message = renderParticipantMessage(selectedTemplate, context);
        if (!message) {
          toastError("Message is empty.");
          return;
        }
        toastError("Instagram send is not available from this table.");
        return;
      }

      await sendAdminParticipantMessage({
        channel,
        template: selectedTemplate,
        context,
        mobile: participant.mobile ?? "",
      });
      recordSentPrefs();
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : "Could not send message.",
      );
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  }

  function handleChannelChange(event: ChangeEvent<HTMLSelectElement>) {
    event.stopPropagation();
    const nextChannel = event.target.value as MessageTemplateChannel;
    setChannel(nextChannel);
    saveParticipantMessagePrefs(leadId, { preferred_channel: nextChannel });
  }

  function handleTemplateChange(event: ChangeEvent<HTMLSelectElement>) {
    event.stopPropagation();
    const nextTemplateId = event.target.value;
    setTemplateId(nextTemplateId);
    saveParticipantMessagePrefs(leadId, { last_template_used: nextTemplateId });
  }

  const disabled = templatesLoading || sending;
  const sendDisabled = disabled || !selectedTemplate;

  return (
    <>
      <TableCell
        className="min-w-[108px] max-w-[132px] whitespace-normal align-middle"
        onClick={(event) => event.stopPropagation()}
      >
        <select
          aria-label={`Channel for ${participant.fullName}`}
          className={selectClassName}
          value={channel}
          disabled={disabled}
          onChange={handleChannelChange}
        >
          {CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </TableCell>

      <TableCell
        className="min-w-[128px] max-w-[180px] whitespace-normal align-middle"
        onClick={(event) => event.stopPropagation()}
      >
        <select
          aria-label={`Template for ${participant.fullName}`}
          className={selectClassName}
          value={templateId ?? ""}
          disabled={disabled || channelTemplates.length === 0}
          onChange={handleTemplateChange}
        >
          {templatesLoading ? (
            <option value="">Loading…</option>
          ) : channelTemplates.length === 0 ? (
            <option value="">No templates</option>
          ) : (
            channelTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))
          )}
        </select>
      </TableCell>

      <TableCell
        className="min-w-[88px] whitespace-normal align-middle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            size="sm"
            className="h-8 w-full px-2 text-xs"
            disabled={sendDisabled}
            onClick={(event) => void handleSend(event)}
          >
            <SendIcon className="size-3.5" />
            Send
          </Button>
          {lastSentAt ? (
            <span
              className="text-[10px] leading-tight text-plum-muted"
              title={lastSentAt}
            >
              Sent {formatRelativeSentAt(lastSentAt)}
            </span>
          ) : null}
        </div>
      </TableCell>
    </>
  );
}

function formatRelativeSentAt(iso: string): string {
  const sent = new Date(iso);
  if (Number.isNaN(sent.getTime())) return "recently";

  const diffMs = Date.now() - sent.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatAdminDate(sent);
}
