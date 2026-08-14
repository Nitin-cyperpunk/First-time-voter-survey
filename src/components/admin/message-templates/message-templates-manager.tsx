"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { REQUIRED_MESSAGE_TEMPLATE_KEYS, LEGACY_MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import {
  MESSAGE_TEMPLATE_PLACEHOLDERS,
  PREVIEW_MOCK_CONTEXT,
} from "@/lib/message-templates/placeholders";
import {
  generateUniqueTemplateKey,
  renderTemplate,
} from "@/lib/message-templates/render-template";
import type {
  MessageTemplate,
  MessageTemplateChannel,
  MessageTemplatesRecord,
} from "@/lib/message-templates/types";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

type ChannelFilter = "all" | MessageTemplateChannel;

type NewTemplateForm = {
  title: string;
  channel: MessageTemplateChannel;
  enabled: boolean;
  template: string;
};

const EMPTY_NEW_TEMPLATE: NewTemplateForm = {
  title: "",
  channel: "whatsapp",
  enabled: true,
  template: "",
};

function ChannelIcon({ channel }: { channel: MessageTemplateChannel }) {
  if (channel === "whatsapp") {
    return <MessageCircleIcon className="size-4 shrink-0 text-primary" />;
  }
  return <Share2Icon className="size-4 shrink-0 text-text-primary" />;
}

function channelLabel(channel: MessageTemplateChannel) {
  return channel === "whatsapp" ? "WhatsApp" : "Instagram";
}

export function MessageTemplatesManager() {
  const [templates, setTemplates] = useState<MessageTemplatesRecord>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<NewTemplateForm>(EMPTY_NEW_TEMPLATE);
  const [newTemplateErrors, setNewTemplateErrors] = useState<Record<string, string>>(
    {},
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/message-templates");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load templates.");
      }
      const next = (payload.templates ?? {}) as MessageTemplatesRecord;
      setTemplates(next);
      setSelectedKey((current) => {
        if (current && next[current]) return current;
        const keys = Object.keys(next);
        return keys[0] ?? null;
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load templates.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const templateEntries = useMemo(() => {
    const legacy = new Set<string>(LEGACY_MESSAGE_TEMPLATE_KEYS);
    return Object.entries(templates)
      .filter(([key]) => !legacy.has(key))
      .sort(([, a], [, b]) => a.title.localeCompare(b.title));
  }, [templates]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templateEntries.filter(([key, template]) => {
      if (channelFilter !== "all" && template.channel !== channelFilter) {
        return false;
      }
      if (!query) return true;
      return (
        key.toLowerCase().includes(query) ||
        template.title.toLowerCase().includes(query)
      );
    });
  }, [templateEntries, search, channelFilter]);

  const selectedTemplate = selectedKey ? templates[selectedKey] : null;

  const disabledRequiredKeys = useMemo(() => {
    return REQUIRED_MESSAGE_TEMPLATE_KEYS.filter((key) => {
      const entry = templates[key];
      return !entry || !entry.enabled;
    });
  }, [templates]);

  const previewText = useMemo(() => {
    if (!selectedTemplate) return "";
    return renderTemplate(selectedTemplate.template, PREVIEW_MOCK_CONTEXT);
  }, [selectedTemplate]);

  const generatedKey = useMemo(() => {
    if (!newTemplate.title.trim()) return "";
    return generateUniqueTemplateKey(newTemplate.title, templates);
  }, [newTemplate.title, templates]);

  function updateSelected(patch: Partial<MessageTemplate>) {
    if (!selectedKey) return;
    setTemplates((current) => ({
      ...current,
      [selectedKey]: { ...current[selectedKey], ...patch },
    }));
  }

  function insertPlaceholder(key: string) {
    const textarea = textareaRef.current;
    if (!textarea || !selectedKey) return;

    const token = `{{${key}}}`;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = selectedTemplate?.template ?? "";
    const next =
      current.slice(0, start) + token + current.slice(end);

    updateSelected({ template: next });

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function handleSave() {
    setSaving(true);
    const loadingId = toastLoading("Saving templates...");

    try {
      const response = await fetch("/api/admin/message-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save templates.");
      }

      setTemplates((payload.templates ?? templates) as MessageTemplatesRecord);
      dismissToast(loadingId);
      toastSuccess("Message templates saved.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error ? error.message : "Failed to save templates.",
      );
    } finally {
      setSaving(false);
    }
  }

  function validateNewTemplate(): boolean {
    const errors: Record<string, string> = {};
    if (!newTemplate.title.trim()) errors.title = "Template name is required.";
    if (!newTemplate.template.trim()) errors.template = "Message text is required.";
    if (!generatedKey) errors.title = "Template name is required.";
    if (templates[generatedKey]) {
      errors.title = "A template with this key already exists.";
    }
    setNewTemplateErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleCreateTemplate() {
    if (!validateNewTemplate()) return;

    const key = generatedKey;
    const entry: MessageTemplate = {
      title: newTemplate.title.trim(),
      channel: newTemplate.channel,
      enabled: newTemplate.enabled,
      template: newTemplate.template,
    };

    setTemplates((current) => ({ ...current, [key]: entry }));
    setSelectedKey(key);
    setNewTemplate(EMPTY_NEW_TEMPLATE);
    setNewTemplateErrors({});
    setNewDialogOpen(false);
  }

  function handleDeleteTemplate() {
    if (!selectedKey) return;
    const key = selectedKey;
    setTemplates((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSelectedKey((current) => {
      if (current !== key) return current;
      const remaining = Object.keys(templates).filter((k) => k !== key);
      return remaining[0] ?? null;
    });
    setDeleteDialogOpen(false);
  }

  if (loading) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-6 text-sm text-plum-muted shadow-sm">
        Loading message templates...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-[14px] border border-border border-l-4 border-l-rose bg-rose-tint p-6 text-sm text-plum-muted shadow-sm">
        <p className="font-medium">{loadError}</p>
        <Button className="mt-4" size="sm" onClick={() => void loadTemplates()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3">
      {disabledRequiredKeys.length > 0 ? (
        <div className="rounded-lg border border-border bg-accent-soft px-3 py-2 text-sm text-text-primary">
          <span className="font-medium">Required templates disabled:</span>{" "}
          <span className="font-mono text-xs">{disabledRequiredKeys.join(", ")}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-sm lg:w-72 xl:w-80">
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Templates</h2>
              <Button size="sm" onClick={() => setNewDialogOpen(true)}>
                <PlusIcon className="size-4" />
                New
              </Button>
            </div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "whatsapp", "instagram"] as const).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={channelFilter === filter ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setChannelFilter(filter)}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "whatsapp"
                      ? "WhatsApp"
                      : "Instagram"}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredEntries.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-plum-muted">
                No templates match.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filteredEntries.map(([key, template]) => {
                  const isSelected = key === selectedKey;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={cn(
                          "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-transparent bg-background hover:border-border hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              template.enabled ? "bg-primary" : "bg-muted-foreground/40",
                            )}
                            aria-hidden
                          />
                          <ChannelIcon channel={template.channel} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {template.title}
                            </p>
                            <p className="truncate text-[10px] text-plum-muted">
                              {channelLabel(template.channel)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-[28rem] min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-sm lg:min-h-0">
          {selectedKey && selectedTemplate ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-foreground">
                    {selectedTemplate.title}
                  </h3>
                  <p className="font-mono text-[10px] text-muted-foreground">{selectedKey}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded border-border"
                      checked={selectedTemplate.enabled}
                      onChange={(event) =>
                        updateSelected({ enabled: event.target.checked })
                      }
                    />
                    Enabled
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-plum-muted">Template Name</label>
                  <Input
                    value={selectedTemplate.title}
                    className="h-8 text-sm"
                    onChange={(event) =>
                      updateSelected({ title: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-plum-muted">Channel</label>
                  <Select
                    value={selectedTemplate.channel}
                    className="h-8 text-sm"
                    onChange={(event) =>
                      updateSelected({
                        channel: event.target.value as MessageTemplateChannel,
                      })
                    }
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                  </Select>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-plum-muted">Message</label>
                  <textarea
                    ref={textareaRef}
                    value={selectedTemplate.template}
                    onChange={(event) =>
                      updateSelected({ template: event.target.value })
                    }
                    rows={8}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-[10rem] w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  />
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-plum-muted">Placeholders</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MESSAGE_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                      <Button
                        key={placeholder.key}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => insertPlaceholder(placeholder.key)}
                      >
                        {placeholder.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-plum-muted">Preview</p>
                  <div className="rounded-md border border-border bg-background p-3">
                    <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                      {previewText || "Preview updates as you type."}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-plum-muted">
              Select a template or create a new one.
            </div>
          )}

          <div className="sticky bottom-0 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
            <Button
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving..." : "Save Templates"}
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
            <DialogDescription>
              Create a reusable message template for WhatsApp or Instagram.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Template Name
              </label>
              <Input
                value={newTemplate.title}
                onChange={(event) =>
                  setNewTemplate((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                aria-invalid={Boolean(newTemplateErrors.title)}
              />
              {newTemplateErrors.title ? (
                <p className="text-xs text-destructive">{newTemplateErrors.title}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Channel</label>
              <Select
                value={newTemplate.channel}
                onChange={(event) =>
                  setNewTemplate((current) => ({
                    ...current,
                    channel: event.target.value as MessageTemplateChannel,
                  }))
                }
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Internal Key
              </label>
              <Input
                value={generatedKey}
                readOnly
                className="font-mono text-xs"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={newTemplate.enabled}
                onChange={(event) =>
                  setNewTemplate((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              Enabled
            </label>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Message</label>
              <textarea
                value={newTemplate.template}
                onChange={(event) =>
                  setNewTemplate((current) => ({
                    ...current,
                    template: event.target.value,
                  }))
                }
                rows={8}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-[8rem] w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                aria-invalid={Boolean(newTemplateErrors.template)}
              />
              {newTemplateErrors.template ? (
                <p className="text-xs text-destructive">
                  {newTemplateErrors.template}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleCreateTemplate}>
                Save Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              This removes &quot;{selectedTemplate?.title}&quot; from your
              configuration. Save to persist the change.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteTemplate}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
