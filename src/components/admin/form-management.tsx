"use client";

import { useState } from "react";

import { FormUploadCard } from "@/components/admin/form-upload-card";
import {
  FormVersionsTable,
  type FormVersionRow,
} from "@/components/admin/form-versions-table";
import { Button } from "@/components/ui/button";
import {
  FORM_TYPE_LABELS,
  FORM_TYPE_PATHS,
  type FormType,
} from "@/lib/forms/types";

type FormManagementProps = {
  panels: Record<
    FormType,
    {
      forms: FormVersionRow[];
      activeForm: FormVersionRow | null;
    }
  >;
};

const TABS: FormType[] = ["registration", "survey"];

export function FormManagement({ panels }: FormManagementProps) {
  const [activeTab, setActiveTab] = useState<FormType>("registration");
  const panel = panels[activeTab];
  const activeForm = panel.activeForm;

  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Form Management
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-plum-muted">
          Upload, preview, publish, and activate HTML forms for registration and
          the main survey. Each form type maintains its own version history.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab}
              type="button"
              size="sm"
              variant={activeTab === tab ? "default" : "outline"}
              onClick={() => setActiveTab(tab)}
            >
              {FORM_TYPE_LABELS[tab]}
            </Button>
          ))}
        </div>

        <p className="mt-4 text-sm text-plum-muted">
          Live {FORM_TYPE_LABELS[activeTab].toLowerCase()} form served at{" "}
          <span className="font-mono text-xs">{FORM_TYPE_PATHS[activeTab]}</span>
          .
        </p>

        {activeForm ? (
          <p className="mt-3 text-sm text-plum-muted">
            Active version:{" "}
            <span className="font-semibold text-foreground">
              v{activeForm.version} · {activeForm.name}
            </span>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              ({activeForm.sourceLabel})
            </span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-amber-700">
            No active published form is configured. Publish a version and set it
            active.
          </p>
        )}
      </div>

      <FormUploadCard formType={activeTab} />
      <FormVersionsTable formType={activeTab} forms={panel.forms} />
    </div>
  );
}
