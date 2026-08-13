"use client";

import { FormUploadCard } from "@/components/admin/form-upload-card";
import {
  FormVersionsTable,
  type FormVersionRow,
} from "@/components/admin/form-versions-table";
import { FORM_TYPE_PATHS } from "@/lib/forms/types";

type FormManagementProps = {
  forms: FormVersionRow[];
  activeForm: FormVersionRow | null;
};

export function FormManagement({ forms, activeForm }: FormManagementProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-foreground">
          Form Management
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-plum-muted">
          Upload, preview, publish, and activate the registration / survey HTML
          form. Only one form type is used in this study.
        </p>

        <p className="mt-4 text-sm text-plum-muted">
          Live survey served at{" "}
          <span className="font-mono text-xs">{FORM_TYPE_PATHS.registration}</span>
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
          <p className="mt-3 text-sm text-text-primary">
            No active published form is configured. Publish a version and set it
            active.
          </p>
        )}
      </div>

      <FormUploadCard formType="registration" />
      <FormVersionsTable formType="registration" forms={forms} />
    </div>
  );
}
