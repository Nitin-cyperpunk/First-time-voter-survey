"use client";

import { useMemo, useState, type ReactNode } from "react";

import { BulkConfirmDialog } from "@/components/admin/bulk-selection";
import { ConfigAuditLog } from "@/components/admin/config-audit-log";
import { ConfigCitiesPanel } from "@/components/admin/config-cities-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { closesAt } from "@/lib/study-config/defaults";
import { isRegistrationAccepting } from "@/lib/study-config/gates";
import type { StudyConfig } from "@/lib/study-config/types";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastSuccess,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

type StudyConfigSettingsProps = {
  initialConfig: StudyConfig;
};

type BoolKey = {
  [K in keyof StudyConfig]: StudyConfig[K] extends boolean ? K : never;
}[keyof StudyConfig];

const OPEN_SWITCHES: Array<{
  key: BoolKey;
  label: string;
  description: string;
  offConsequence: string;
  onConsequence: string;
}> = [
  {
    key: "survey_active",
    label: "Survey active (master)",
    description: "Master switch for accepting new screener responses.",
    offConsequence:
      "New screener responses will stop being accepted until you turn this back on.",
    onConsequence:
      "New screener responses will be accepted again (subject to other open/close gates).",
  },
  {
    key: "screener_open",
    label: "Screener form live",
    description: "When off, the registration form shows the closed page.",
    offConsequence:
      "The registration form will show the closed page until you turn this back on.",
    onConsequence:
      "The registration form will be live again for new respondents.",
  },
  {
    key: "eligibility_open",
    label: "Eligibility open",
    description: "When off, new participants cannot become Eligible.",
    offConsequence:
      "New participants will not be able to become Eligible until you turn this back on.",
    onConsequence: "New participants will be able to become Eligible again.",
  },
  {
    key: "project_open",
    label: "Project open",
    description: "When off, registration and eligibility both stay closed.",
    offConsequence:
      "Registration and eligibility will both stay closed until you turn this back on.",
    onConsequence:
      "Registration and eligibility can open again (subject to the other switches).",
  },
];

const TERM_SWITCHES: Array<{ key: BoolKey; label: string }> = [
  { key: "term_consent_no", label: "Consent = No" },
  { key: "term_gender_male", label: "Gender = Male" },
  { key: "term_decider_other", label: "Decider = Other" },
  { key: "term_occupation_sensitive", label: "Occupation (sensitive)" },
  { key: "term_last_buy_12mo", label: "Last buy > 12 months" },
];

type PendingOpenToggle = {
  key: BoolKey;
  label: string;
  next: boolean;
  consequence: string;
};

export function StudyConfigSettings({ initialConfig }: StudyConfigSettingsProps) {
  const [config, setConfig] = useState<StudyConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PendingOpenToggle | null>(
    null,
  );
  const [activeCitySum, setActiveCitySum] = useState(0);
  const cap = useMemo(() => closesAt(config), [config]);
  const unallocated = config.total_capacity - activeCitySum;

  function patch(partial: Partial<StudyConfig>) {
    setConfig((current) => ({ ...current, ...partial }));
  }

  function requestOpenToggle(key: BoolKey, next: boolean) {
    const item = OPEN_SWITCHES.find((switchItem) => switchItem.key === key);
    if (!item) {
      patch({ [key]: next });
      return;
    }
    setPendingToggle({
      key,
      label: item.label,
      next,
      consequence: next ? item.onConsequence : item.offConsequence,
    });
  }

  function confirmOpenToggle() {
    if (!pendingToggle) return;
    patch({ [pendingToggle.key]: pendingToggle.next });
    setPendingToggle(null);
  }

  async function save() {
    setSaving(true);
    const loadingId = toastLoading("Saving study config...");
    try {
      const response = await fetch("/api/admin/study-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save study config.");
      }
      setConfig(payload.config as StudyConfig);
      dismissToast(loadingId);
      toastSuccess("Study config saved.");
    } catch (error) {
      dismissToast(loadingId);
      toastError(
        error instanceof Error ? error.message : "Failed to save study config.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Config
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-plum-muted">
              Form open/close, global capacity, city quotas, and study gates.
              Superadmin only. Saved on the registration{" "}
              <span className="font-mono text-xs">form_settings</span> row.
            </p>
          </div>
          <StatusBadge config={config} />
        </div>
      </div>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span
            className="size-2 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          Form open / close
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-plum-muted">
          Closed: the respondent route shows the closed screen (questions are
          not mounted) and submit APIs reject with{" "}
          <span className="font-mono">form_closed</span>. In-progress tabs are
          blocked at submit. Referral links still resolve to the same closed
          screen.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Accept responses</p>
            <p className="text-xs text-plum-muted">
              form_status = {config.form_status}
            </p>
          </div>
          <Toggle
            checked={config.form_status === "open"}
            onChange={(next) =>
              patch({ form_status: next ? "open" : "closed" })
            }
            label="Form status"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Auto-close when full
            </p>
            <p className="text-xs text-plum-muted">
              Sets form_status to closed when qualified completions reach total
              capacity.
            </p>
          </div>
          <Toggle
            checked={config.auto_close_on_full}
            onChange={(next) => patch({ auto_close_on_full: next })}
            label="Auto-close on full"
          />
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span
            className="size-2 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          Global capacity
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-plum-muted">
          Hard cap on <strong>qualified completions</strong> only (passed
          terminate gates and submitted). Terminated and abandoned responses do
          not count. Sum of active city capacities cannot exceed this number.
        </p>
        <label className="mt-4 block max-w-xs space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
            Total capacity
          </span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="h-11 text-base font-semibold tabular-nums"
            value={config.total_capacity}
            onChange={(event) =>
              patch({
                total_capacity: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </label>
        <p
          className={`mt-3 text-sm font-medium ${
            unallocated < 0 ? "text-error" : "text-text-primary"
          }`}
        >
          Unallocated: {unallocated}
          {unallocated < 0
            ? " — save is blocked until city capacities fit."
            : null}
        </p>
      </section>

      <ConfigCitiesPanel
        totalCapacity={config.total_capacity}
        onCapacityHintChange={setActiveCitySum}
      />

      <ConfigAuditLog />

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span
            className="size-2 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          Funnel target &amp; buffer
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-plum-muted">
          Display target for the metrics funnel (eligible / verified). This is
          separate from the hard qualified-completion cap above.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
              Target respondents
            </span>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              className="h-11 text-base font-semibold tabular-nums"
              value={config.target}
              onChange={(event) =>
                patch({
                  target: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
            <span className="block text-xs text-plum-muted">
              The N you actually need (e.g. 150 / 200)
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
              Buffer
            </span>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-11 text-base font-semibold tabular-nums"
              value={config.buffer}
              onChange={(event) =>
                patch({
                  buffer: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
            <span className="block text-xs text-plum-muted">
              Extra headroom on top of target
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-[12px] border border-border bg-rose-tint px-4 py-4 text-center sm:gap-x-6">
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {config.target}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-plum-faint">
              Target
            </p>
          </div>
          <span className="text-lg font-semibold text-plum-faint" aria-hidden>
            +
          </span>
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {config.buffer}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-plum-faint">
              Buffer
            </p>
          </div>
          <span className="text-lg font-semibold text-plum-faint" aria-hidden>
            =
          </span>
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-primary">
              {cap}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
              Closes at
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[12px] border border-border bg-accent-soft px-4 py-3 text-sm leading-relaxed text-text-primary">
          Funnel metrics still use target + buffer. Enforcement of new
          completions uses total capacity and city quotas.
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span
            className="size-2 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          Incentives
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-plum-muted">
          Survey pay goes to people who complete the survey and pass QC (existing
          payouts flow). Referral pay is per friend who qualifies — default ₹0
          until you set an amount.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
              Survey incentive (₹)
            </span>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-11 text-base font-semibold tabular-nums"
              value={config.survey_reward_amount}
              onChange={(event) =>
                patch({
                  survey_reward_amount: Math.max(
                    0,
                    Number(event.target.value) || 0,
                  ),
                })
              }
            />
            <span className="block text-xs text-plum-muted">
              Paid after QC pass (review_pass / successful)
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-plum-faint">
              Referral incentive (₹)
            </span>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-11 text-base font-semibold tabular-nums"
              value={config.referral_reward_amount}
              onChange={(event) =>
                patch({
                  referral_reward_amount: Math.max(
                    0,
                    Number(event.target.value) || 0,
                  ),
                })
              }
            />
            <span className="block text-xs text-plum-muted">
              Per qualified referral (default 0)
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">
          Open / close
        </h3>
        <p className="mt-1 text-sm text-plum-muted">
          Turning any switch on or off asks for confirmation. Defaults are all
          open.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {OPEN_SWITCHES.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {item.label}
                </p>
                <p className="text-xs text-plum-muted">{item.description}</p>
              </div>
              <Toggle
                checked={config[item.key]}
                onChange={(next) => requestOpenToggle(item.key, next)}
                label={item.label}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">
          Screener terminations
        </h3>
        <p className="mt-1 text-sm text-plum-muted">
          Age rule is enforced on registration. Other flags are stored for the
          screener ruleset / Part 2 metrics.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-rose-tint/30 px-3 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Age rule</p>
            <p className="text-xs text-plum-muted">
              Screen out outside the range when enabled.
            </p>
          </div>
          <Toggle
            checked={config.age_rule_on}
            onChange={(next) => patch({ age_rule_on: next })}
            label="Age rule"
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Age min">
            <Input
              type="number"
              min={1}
              max={120}
              disabled={!config.age_rule_on}
              value={config.age_min}
              onChange={(event) =>
                patch({ age_min: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Age max">
            <Input
              type="number"
              min={1}
              max={120}
              disabled={!config.age_rule_on}
              value={config.age_max}
              onChange={(event) =>
                patch({ age_max: Number(event.target.value) || 0 })
              }
            />
          </Field>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {TERM_SWITCHES.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 py-3"
            >
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <Toggle
                checked={config[item.key]}
                onChange={(next) => patch({ [item.key]: next })}
                label={item.label}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
      </div>

      <BulkConfirmDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open) setPendingToggle(null);
        }}
        title={
          pendingToggle
            ? `Are you sure you want to turn ${pendingToggle.next ? "on" : "off"} “${pendingToggle.label}”?`
            : "Are you sure?"
        }
        description={
          pendingToggle
            ? `${pendingToggle.consequence} Remember to Save configuration after confirming.`
            : ""
        }
        confirmLabel={
          pendingToggle?.next ? "Yes, turn on" : "Yes, turn off"
        }
        onConfirm={confirmOpenToggle}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-semibold text-plum-muted">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ config }: { config: StudyConfig }) {
  const open = isRegistrationAccepting(config);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
        open
          ? "bg-accent-soft text-primary"
          : "bg-accent-soft text-text-muted",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          open ? "bg-primary" : "bg-text-muted",
        )}
      />
      {open
        ? "Live — Accepting Responses"
        : "Closed — Not Accepting Responses"}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
        checked
          ? "border-primary bg-primary"
          : "border-border bg-rose-tint",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-surface shadow-sm transition-transform",
          checked ? "left-6" : "left-0.5",
        )}
      />
    </button>
  );
}
