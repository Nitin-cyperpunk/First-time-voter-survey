import { FormObserver } from "@/analytics/FormObserver";
import { IdleTracker } from "@/analytics/IdleTracker";
import { QuestionTracker } from "@/analytics/QuestionTracker";
import { SubmitTracker } from "@/analytics/SubmitTracker";
import type { SurveyAnalyticsExport } from "@/analytics/types";
import { nowIso, resolveSurveyRoot, safePerformanceNow } from "@/analytics/utils";

class SurveyAnalyticsEngine {
  private root: HTMLElement | null = null;
  private startedAt: string | null = null;
  private startedAtPerf: number | null = null;
  private submittedAt: string | null = null;
  private idleTracker = new IdleTracker();
  private questionTracker = new QuestionTracker();
  private formObserver = new FormObserver();
  private submitTracker = new SubmitTracker();
  private running = false;

  start(element: HTMLElement) {
    try {
      this.stop();
      const root = resolveSurveyRoot(element);
      this.root = root;
      this.startedAt = nowIso();
      this.startedAtPerf = safePerformanceNow();
      this.submittedAt = null;
      this.running = true;

      this.questionTracker.setOnRevisit(() => {
        this.submitTracker.markRevisit();
      });

      this.idleTracker.start(root);
      this.questionTracker.start(root, this.idleTracker);
      this.submitTracker.start(root, () => {
        this.submittedAt = nowIso();
      });
      this.formObserver.start(root, () => {
        this.questionTracker.refreshQuestions();
      });
    } catch (error) {
      console.warn("[SurveyAnalytics] Failed to start:", error);
    }
  }

  stop() {
    if (!this.running) return;

    this.formObserver.stop();
    this.submitTracker.stop();
    this.questionTracker.stop();
    this.idleTracker.stop();

    this.root = null;
    this.running = false;
  }

  export(): SurveyAnalyticsExport | null {
    try {
      if (!this.running || !this.startedAt || this.startedAtPerf === null) {
        return null;
      }

      const submittedAt = this.submittedAt ?? nowIso();
      const completionTimeMs = Math.max(
        0,
        Math.round(safePerformanceNow() - this.startedAtPerf),
      );
      const idleTimeMs = Math.round(this.idleTracker.getTotalIdleMs());
      const activeTimeMs = Math.max(0, completionTimeMs - idleTimeMs);
      const totals = this.questionTracker.getTotals();

      return {
        survey: {
          started_at: this.startedAt,
          submitted_at: submittedAt,
          completion_time_ms: completionTimeMs,
          idle_time_ms: idleTimeMs,
          active_time_ms: activeTimeMs,
          total_questions: totals.total_questions,
          answered_questions: totals.answered_questions,
          skipped_questions: totals.skipped_questions,
          completion_percentage: totals.completion_percentage,
          behaviour: this.submitTracker.exportBehaviour(),
        },
        questions: this.questionTracker.exportQuestions(),
      };
    } catch (error) {
      console.warn("[SurveyAnalytics] Failed to export:", error);
      return null;
    }
  }

  reset() {
    this.stop();
    this.startedAt = null;
    this.startedAtPerf = null;
    this.submittedAt = null;
  }
}

const engine = new SurveyAnalyticsEngine();

export const SurveyAnalytics = {
  start(element: HTMLElement) {
    engine.start(element);
  },
  stop() {
    engine.stop();
  },
  export() {
    return engine.export();
  },
  reset() {
    engine.reset();
  },
};

export type { SurveyAnalyticsExport } from "@/analytics/types";
