"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { InstagramIdEditableCell } from "@/features/message-templates/components/instagram-id-editable-cell";
import { InstagramNoUsernameModal } from "@/features/message-templates/components/instagram-no-username-modal";
import { InstagramVisibilityToggle } from "@/features/message-templates/components/instagram-visibility-toggle";
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
import type { DmStatus } from "@/lib/dm-verify";
import {
  createMarkMessageReceivedHandler,
  normalizeInstagramId,
  openInstagramProfile,
  persistParticipantInstagramId,
  persistParticipantInstagramVisibility,
  runInstagramSend,
  sanitizeInstagramHandleForProfile,
  type InstagramVisibility,
} from "@/lib/instagram";
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
  surveyUrl?: string | null;
  instagramId?: string | null;
  instagramVisibility?: InstagramVisibility;
  onInstagramIdSaved?: (instagramId: string | null) => void;
  onInstagramVisibilitySaved?: (visibility: InstagramVisibility) => void;
  onDmStatusUpdated?: (dmStatus: DmStatus) => void;
};

export function ParticipantMessageRowCells({
  leadId,
  participant,
  templates,
  templatesLoading = false,
  surveyUrl = null,
  instagramId = null,
  instagramVisibility = "public",
  onInstagramIdSaved,
  onInstagramVisibilitySaved,
  onDmStatusUpdated,
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
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibility, setVisibility] =
    useState<InstagramVisibility>(instagramVisibility);
  const [instagramDraft, setInstagramDraft] = useState(instagramId ?? "");
  const [noUsernameModalOpen, setNoUsernameModalOpen] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(
    () => loadParticipantMessagePrefs(leadId).last_sent_at ?? null,
  );

  useEffect(() => {
    setInstagramDraft(instagramId ?? "");
  }, [instagramId]);

  useEffect(() => {
    setVisibility(instagramVisibility);
  }, [instagramVisibility]);

  const context = useMemo(
    () =>
      buildParticipantTemplateContext({
        ...participant,
        surveyUrl: surveyUrl ?? participant.surveyUrl ?? null,
      }),
    [participant, surveyUrl],
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

  async function handleVisibilityChange(next: InstagramVisibility) {
    if (next === visibility || visibilitySaving) return;
    const previous = visibility;
    setVisibility(next);
    setVisibilitySaving(true);
    try {
      const saved = await persistParticipantInstagramVisibility(leadId, next);
      setVisibility(saved);
      onInstagramVisibilitySaved?.(saved);
    } catch (error) {
      setVisibility(previous);
      toastError(
        error instanceof Error
          ? error.message
          : "Failed to save Instagram visibility.",
      );
    } finally {
      setVisibilitySaving(false);
    }
  }

  /** PRIVATE branch only — opens profile. Public path is unchanged below. */
  function handlePrivateInstagramSend() {
    const raw = instagramDraft.trim() || (instagramId ?? "").trim();
    if (!raw) {
      setNoUsernameModalOpen(true);
      return;
    }

    const sanitized = sanitizeInstagramHandleForProfile(raw);
    if (!sanitized.ok) {
      toastError(sanitized.error);
      return;
    }

    openInstagramProfile(sanitized.handle);
    const sentAt = new Date().toISOString();
    saveParticipantMessagePrefs(leadId, {
      preferred_channel: channel,
      last_sent_at: sentAt,
      ...(selectedTemplate
        ? { last_template_used: selectedTemplate.id }
        : {}),
    });
    setLastSentAt(sentAt);
  }

  async function handleInstagramSend(message: string) {
    // Validate sync so openInstagramDmUrl runs inside the click gesture.
    const raw = instagramDraft.trim() || (instagramId ?? "").trim();
    if (!raw) {
      setNoUsernameModalOpen(true);
      return;
    }

    const normalized = normalizeInstagramId(raw);
    if (!normalized.ok) {
      setNoUsernameModalOpen(true);
      return;
    }

    const sendResult = await runInstagramSend({
      message,
      instagramId: normalized.username,
      updateDmStatus: createMarkMessageReceivedHandler(leadId),
    });

    if (
      sendResult.status === "missing_username" ||
      sendResult.status === "invalid_username"
    ) {
      setNoUsernameModalOpen(true);
      return;
    }

    if (normalized.username !== (instagramId ?? "").trim()) {
      try {
        const saved = await persistParticipantInstagramId(
          leadId,
          normalized.username,
        );
        onInstagramIdSaved?.(saved ?? normalized.username);
      } catch (error) {
        toastError(
          error instanceof Error
            ? error.message
            : "Failed to save Instagram ID.",
        );
      }
    }

    onDmStatusUpdated?.("call_pending");
    recordSentPrefs();
  }

  async function handleSend(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (sendingLockRef.current) return;

    // --- PRIVATE branch (additive) ---
    if (channel === "instagram" && visibility === "private") {
      sendingLockRef.current = true;
      setSending(true);
      try {
        handlePrivateInstagramSend();
      } finally {
        sendingLockRef.current = false;
        setSending(false);
      }
      return;
    }

    // --- PUBLIC / WhatsApp branch (existing behavior, unchanged) ---
    if (!selectedTemplate) {
      toastError("Select a template first.");
      return;
    }

    // Guard: block send if template uses a refill/survey link that hasn't been
    // generated yet for this respondent, to avoid dispatching a broken message.
    const templateBody = selectedTemplate.body ?? "";
    if (
      /\{\{\s*screener_refill_link\s*\}\}/.test(templateBody) &&
      !context.screener_refill_link
    ) {
      toastError(
        "This template uses {screener_refill_link} but no screener refill link exists for this respondent yet. Request a refill first.",
      );
      return;
    }
    if (
      /\{\{\s*survey_refill_link\s*\}\}/.test(templateBody) &&
      !context.survey_refill_link
    ) {
      toastError(
        "This template uses {survey_refill_link} but no survey link exists for this respondent yet. Grant survey access first.",
      );
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
        await handleInstagramSend(message);
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
  const sendDisabled =
    disabled ||
    (visibility === "public" && channel === "instagram" && !selectedTemplate) ||
    (channel === "whatsapp" && !selectedTemplate);

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
        className="min-w-[132px] max-w-[180px] whitespace-normal align-middle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <InstagramVisibilityToggle
            value={visibility}
            disabled={disabled || visibilitySaving}
            onChange={(next) => void handleVisibilityChange(next)}
          />
          <InstagramIdEditableCell
            leadId={leadId}
            value={instagramId}
            disabled={disabled}
            onSaved={onInstagramIdSaved}
            onDraftChange={setInstagramDraft}
          />
        </div>
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

      <InstagramNoUsernameModal
        open={noUsernameModalOpen}
        onOpenChange={setNoUsernameModalOpen}
      />
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
