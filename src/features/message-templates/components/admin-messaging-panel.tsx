"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyIcon, MessageCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { TemplatePreview } from "@/features/message-templates/components/template-preview";
import { TemplateSelector } from "@/features/message-templates/components/template-selector";
import {
  useAdminMessageTemplates,
  useTemplateSelection,
} from "@/features/message-templates/hooks/use-admin-message-templates";
import {
  buildParticipantTemplateContext,
  type ParticipantTemplateSource,
} from "@/features/message-templates/lib/normalize-templates";
import { useInstagramDmGuide } from "@/hooks/use-instagram-dm-guide";
import { renderMessageTemplate } from "@/lib/message-templates/render-template";
import type { MessageTemplateChannel } from "@/lib/message-templates/types";
import { buildWhatsAppShareUrl } from "@/lib/message-templates/client";
import { toastError, toastSuccess } from "@/lib/toast";

type AdminMessagingPanelProps = {
  participant: ParticipantTemplateSource | null;
  surveyUrl?: string | null;
  onSurveyUrlChange?: (url: string | null) => void;
  showSurveyActions?: boolean;
  onTemplateChange?: (
    templateId: string | null,
    channel: MessageTemplateChannel,
  ) => void;
};

export function AdminMessagingPanel({
  participant,
  surveyUrl = null,
  onSurveyUrlChange,
  showSurveyActions = false,
  onTemplateChange,
}: AdminMessagingPanelProps) {
  const { templates, loading, error } = useAdminMessageTemplates();
  const { startInstagramDm, modal } = useInstagramDmGuide();
  const {
    channel,
    setChannel,
    channelTemplates,
    selectedTemplate,
    setTemplateId,
  } = useTemplateSelection({ templates });

  useEffect(() => {
    onTemplateChange?.(selectedTemplate?.id ?? null, channel);
  }, [selectedTemplate?.id, channel, onTemplateChange]);

  const context = useMemo(() => {
    if (!participant) return {};
    return buildParticipantTemplateContext({
      ...participant,
      surveyUrl: surveyUrl ?? participant.surveyUrl ?? null,
    });
  }, [participant, surveyUrl]);

  const renderedMessage = useMemo(() => {
    if (!selectedTemplate) return "";
    return renderMessageTemplate(selectedTemplate.body, context);
  }, [selectedTemplate, context]);

  async function copyRenderedMessage() {
    if (!renderedMessage.trim()) {
      toastError("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(renderedMessage);
      toastSuccess("Message copied to clipboard.");
    } catch {
      toastError("Could not copy message.");
    }
  }

  function shareWhatsApp() {
    if (!renderedMessage.trim()) {
      toastError("Nothing to share.");
      return;
    }
    window.open(
      buildWhatsAppShareUrl(renderedMessage),
      "_blank",
      "noopener,noreferrer",
    );
  }

  function shareInstagram() {
    if (!renderedMessage.trim()) {
      toastError("Nothing to share.");
      return;
    }
    startInstagramDm({ message: renderedMessage });
  }

  async function copySurveyLinkOnly() {
    const url = surveyUrl ?? participant?.surveyUrl ?? null;
    if (!url) {
      toastError("Grant survey access first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      onSurveyUrlChange?.(url);
      toastSuccess("Survey link copied.");
    } catch {
      toastError("Could not copy survey link.");
    }
  }

  if (loading) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-4 text-sm text-plum-muted shadow-sm">
        Loading message templates...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-4 text-sm text-rose-700 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4 rounded-[14px] border border-border bg-card p-4 shadow-sm sm:p-5">
      <TemplateSelector
        channel={channel}
        templateId={selectedTemplate?.id ?? null}
        templates={channelTemplates}
        onChannelChange={setChannel}
        onTemplateChange={setTemplateId}
      />

      <TemplatePreview
        template={selectedTemplate}
        context={context}
        emptyMessage={
          participant
            ? "Select a template to preview the message."
            : "Select a participant to preview personalized messages."
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="sm:flex-1"
          disabled={!participant || !renderedMessage}
          onClick={() => void copyRenderedMessage()}
        >
          <CopyIcon className="size-4" />
          Copy Message
        </Button>
        {channel === "whatsapp" ? (
          <Button
            type="button"
            className="sm:flex-1"
            disabled={!participant || !renderedMessage}
            onClick={shareWhatsApp}
          >
            <MessageCircleIcon className="size-4" />
            Share on WhatsApp
          </Button>
        ) : (
          <Button
            type="button"
            className="sm:flex-1"
            disabled={!participant || !renderedMessage}
            onClick={() => void shareInstagram()}
          >
            <InstagramIcon className="size-4" />
            Share on Instagram
          </Button>
        )}
        {showSurveyActions ? (
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            disabled={!surveyUrl && !participant?.surveyUrl}
            onClick={() => void copySurveyLinkOnly()}
          >
            <CopyIcon className="size-4" />
            Copy Survey Link
          </Button>
        ) : null}
      </div>
    </div>
    {modal}
    </>
  );
}
