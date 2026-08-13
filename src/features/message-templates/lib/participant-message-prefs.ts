import type { MessageTemplateChannel } from "@/lib/message-templates/types";

const STORAGE_KEY = "concave_admin_participant_message_prefs";

export type ParticipantMessagePrefs = {
  preferred_channel?: MessageTemplateChannel;
  last_template_used?: string;
  last_sent_at?: string;
};

type PrefsStore = Record<string, ParticipantMessagePrefs>;

function readStore(): PrefsStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrefsStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: PrefsStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function loadParticipantMessagePrefs(
  leadId: string,
): ParticipantMessagePrefs {
  return readStore()[leadId] ?? {};
}

export function saveParticipantMessagePrefs(
  leadId: string,
  updates: ParticipantMessagePrefs,
): void {
  const store = readStore();
  store[leadId] = {
    ...store[leadId],
    ...updates,
  };
  writeStore(store);
}
