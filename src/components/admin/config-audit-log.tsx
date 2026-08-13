"use client";

import { useEffect, useState } from "react";

import type { ConfigAuditEntry } from "@/server/repositories/config-audit.repository";

export function ConfigAuditLog() {
  const [entries, setEntries] = useState<ConfigAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/admin/config-audit")
      .then((response) => response.json())
      .then((data: { entries?: ConfigAuditEntry[] }) => {
        setEntries(data.entries ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">Config audit log</h3>
      <p className="mt-2 text-sm text-plum-muted">
        Form status, total capacity, and city capacity changes. Read-only.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">Actor</th>
              <th className="py-2 pr-3">Field</th>
              <th className="py-2 pr-3">Old</th>
              <th className="py-2">New</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 text-text-muted">
                  Loading audit log…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-text-muted">
                  No config changes recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/70">
                  <td className="py-2.5 pr-3 font-mono text-xs text-text-muted">
                    {new Date(entry.createdAt).toLocaleString("en-IN")}
                  </td>
                  <td className="py-2.5 pr-3 text-text-body">
                    {entry.actorEmail ?? "system"}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text-primary">
                    {entry.field}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text-muted">
                    {entry.oldValue ?? "—"}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-text-body">
                    {entry.newValue ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
