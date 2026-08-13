"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastNetworkError,
} from "@/lib/toast";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const loadingId = toastLoading("Signing in...");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      dismissToast(loadingId);

      if (!response.ok) {
        toastError("Login failed", {
          description: data.error ?? "Please try again.",
        });
        return;
      }

      router.push("/metrics");
      router.refresh();
    } catch {
      dismissToast(loadingId);
      toastNetworkError();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-[14px] border border-border bg-card p-6 shadow-sm"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-[10px] bg-primary text-sm font-bold text-white">
            C
          </div>
          <h1 className="text-xl font-semibold text-foreground">Admin login</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your admin email and password.
          </p>
        </div>

        <div>
          <label htmlFor="email" className="text-sm font-semibold text-plum-muted">
            Email
          </label>
          <Input
            id="email"
            type="email"
            className="mt-1 bg-card"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-semibold text-plum-muted">
            Password
          </label>
          <Input
            id="password"
            type="password"
            className="mt-1 bg-card"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
