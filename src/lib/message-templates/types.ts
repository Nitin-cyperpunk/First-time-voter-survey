export type MessageTemplateChannel = "whatsapp" | "instagram";

export type MessageTemplate = {
  title: string;
  channel: MessageTemplateChannel;
  enabled: boolean;
  template: string;
};

export type MessageTemplatesRecord = Record<string, MessageTemplate>;

export type TemplateContext = Record<string, string | number | null | undefined>;
