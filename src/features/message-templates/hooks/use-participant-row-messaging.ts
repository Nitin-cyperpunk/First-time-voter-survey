"use client";

import { useEffect, useMemo, useState } from "react";

import {
  filterTemplatesByChannel,
  type NormalizedMessageTemplate,
} from "@/features/message-templates/lib/normalize-templates";
import { loadParticipantMessagePrefs } from "@/features/message-templates/lib/participant-message-prefs";
import type { MessageTemplateChannel } from "@/lib/message-templates/types";

function resolveTemplateId(
  channelTemplates: NormalizedMessageTemplate[],
  preferredId: string | undefined,
): string | null {
  if (
    preferredId &&
    channelTemplates.some((template) => template.id === preferredId)
  ) {
    return preferredId;
  }
  return channelTemplates[0]?.id ?? null;
}

export function useParticipantRowMessaging(
  leadId: string,
  templates: NormalizedMessageTemplate[],
) {
  const [channel, setChannel] = useState<MessageTemplateChannel>(() => {
    return loadParticipantMessagePrefs(leadId).preferred_channel ?? "instagram";
  });
  const [templateId, setTemplateId] = useState<string | null>(null);

  const channelTemplates = useMemo(
    () => filterTemplatesByChannel(templates, channel),
    [templates, channel],
  );

  const selectedTemplate = useMemo(() => {
    if (!templateId) return null;
    return channelTemplates.find((template) => template.id === templateId) ?? null;
  }, [channelTemplates, templateId]);

  useEffect(() => {
    if (templates.length === 0) {
      setTemplateId(null);
      return;
    }
    const prefs = loadParticipantMessagePrefs(leadId);
    setTemplateId(
      resolveTemplateId(channelTemplates, prefs.last_template_used),
    );
  }, [leadId, channel, templates, channelTemplates]);

  return {
    channel,
    setChannel,
    templateId,
    setTemplateId,
    channelTemplates,
    selectedTemplate,
  };
}
