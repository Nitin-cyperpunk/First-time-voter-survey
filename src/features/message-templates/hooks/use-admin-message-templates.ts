"use client";

import { useEffect, useMemo, useState } from "react";

import type { MessageTemplateChannel } from "@/lib/message-templates/types";
import {
  filterTemplatesByChannel,
  normalizeMessageTemplates,
  type NormalizedMessageTemplate,
} from "@/features/message-templates/lib/normalize-templates";

type UseAdminMessageTemplatesResult = {
  templates: NormalizedMessageTemplate[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useAdminMessageTemplates(): UseAdminMessageTemplatesResult {
  const [templates, setTemplates] = useState<NormalizedMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/message-templates");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load templates.");
      }
      setTemplates(normalizeMessageTemplates(payload.templates ?? {}));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load templates.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { templates, loading, error, reload: load };
}

type UseTemplateSelectionOptions = {
  templates: NormalizedMessageTemplate[];
  initialChannel?: MessageTemplateChannel;
  initialTemplateId?: string | null;
};

export function useTemplateSelection({
  templates,
  initialChannel = "instagram",
  initialTemplateId = null,
}: UseTemplateSelectionOptions) {
  const [channel, setChannel] = useState<MessageTemplateChannel>(initialChannel);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);

  const channelTemplates = useMemo(
    () => filterTemplatesByChannel(templates, channel),
    [templates, channel],
  );

  const selectedTemplate = useMemo(() => {
    if (templateId && channelTemplates.some((item) => item.id === templateId)) {
      return channelTemplates.find((item) => item.id === templateId) ?? null;
    }
    return channelTemplates[0] ?? null;
  }, [channelTemplates, templateId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateId(null);
      return;
    }
    if (templateId !== selectedTemplate.id) {
      setTemplateId(selectedTemplate.id);
    }
  }, [selectedTemplate, templateId]);

  function changeChannel(nextChannel: MessageTemplateChannel) {
    setChannel(nextChannel);
    const nextTemplates = filterTemplatesByChannel(templates, nextChannel);
    setTemplateId(nextTemplates[0]?.id ?? null);
  }

  return {
    channel,
    setChannel: changeChannel,
    templateId: selectedTemplate?.id ?? null,
    setTemplateId,
    channelTemplates,
    selectedTemplate,
  };
}
