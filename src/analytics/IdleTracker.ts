import { safePerformanceNow } from "@/analytics/utils";

const IDLE_THRESHOLD_MS = 30_000;

type IdleListener = (idle: boolean) => void;

export class IdleTracker {
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isIdle = false;
  private idleStartedAt: number | null = null;
  private totalIdleMs = 0;
  private listeners = new Set<IdleListener>();
  private boundOnActivity: () => void;
  private started = false;

  constructor() {
    this.boundOnActivity = () => this.onActivity();
  }

  start(root: HTMLElement) {
    if (this.started) return;
    this.started = true;

    const options: AddEventListenerOptions = { capture: true, passive: true };
    root.addEventListener("pointerdown", this.boundOnActivity, options);
    root.addEventListener("keydown", this.boundOnActivity, options);
    root.addEventListener("focusin", this.boundOnActivity, options);
    root.addEventListener("input", this.boundOnActivity, options);
    root.addEventListener("change", this.boundOnActivity, options);
    root.addEventListener("scroll", this.boundOnActivity, options);

    this.scheduleIdleCheck();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.clearIdleTimeout();
    this.finalizeIdlePeriod();
  }

  onChange(listener: IdleListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getTotalIdleMs() {
    if (this.isIdle && this.idleStartedAt !== null) {
      return this.totalIdleMs + (safePerformanceNow() - this.idleStartedAt);
    }
    return this.totalIdleMs;
  }

  getIsIdle() {
    return this.isIdle;
  }

  private onActivity() {
    if (this.isIdle) {
      this.finalizeIdlePeriod();
      this.isIdle = false;
      this.notify(false);
    }

    this.scheduleIdleCheck();
  }

  private scheduleIdleCheck() {
    this.clearIdleTimeout();
    this.idleTimeoutId = setTimeout(() => {
      if (!this.isIdle) {
        this.isIdle = true;
        this.idleStartedAt = safePerformanceNow();
        this.notify(true);
      }
    }, IDLE_THRESHOLD_MS);
  }

  private finalizeIdlePeriod() {
    if (this.isIdle && this.idleStartedAt !== null) {
      this.totalIdleMs += safePerformanceNow() - this.idleStartedAt;
      this.idleStartedAt = null;
    }
  }

  private clearIdleTimeout() {
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
  }

  private notify(idle: boolean) {
    for (const listener of this.listeners) {
      try {
        listener(idle);
      } catch {
        // Analytics must never interrupt the survey.
      }
    }
  }
}
