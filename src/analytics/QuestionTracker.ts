import type {
  QuestionAnalyticsExport,
  QuestionInputType,
} from "@/analytics/types";
import {
  discoverQuestions,
  getQuestionType,
  isAnswered,
  nowIso,
  readQuestionAnswer,
  safePerformanceNow,
} from "@/analytics/utils";
import type { IdleTracker } from "@/analytics/IdleTracker";

type QuestionState = {
  question_type: QuestionInputType;
  time_ms: number;
  edits: number;
  visited: boolean;
  skipped: boolean;
  revisited: boolean;
  visit_count: number;
  final_answer: string | string[] | null;
  start_time: string | null;
  end_time: string | null;
  active_since: number | null;
};

export class QuestionTracker {
  private root: HTMLElement | null = null;
  private states = new Map<string, QuestionState>();
  private activeQuestionId: string | null = null;
  private idleTracker: IdleTracker | null = null;
  private idleUnsubscribe: (() => void) | null = null;
  private elementToQuestionId = new Map<HTMLElement, string>();
  private boundFocusIn: (event: FocusEvent) => void;
  private boundFocusOut: (event: FocusEvent) => void;
  private boundInput: (event: Event) => void;
  private boundChange: (event: Event) => void;
  private onRevisit: (() => void) | null = null;

  constructor() {
    this.boundFocusIn = (event) => this.handleFocusIn(event);
    this.boundFocusOut = (event) => this.handleFocusOut(event);
    this.boundInput = (event) => this.handleEdit(event);
    this.boundChange = (event) => this.handleEdit(event);
  }

  start(root: HTMLElement, idleTracker: IdleTracker) {
    this.root = root;
    this.idleTracker = idleTracker;
    this.refreshQuestions();
    this.idleUnsubscribe = idleTracker.onChange((idle) => {
      if (idle) {
        this.pauseActiveTimer();
      } else if (this.activeQuestionId) {
        this.resumeActiveTimer(this.activeQuestionId);
      }
    });

    const options: AddEventListenerOptions = { capture: true };
    root.addEventListener("focusin", this.boundFocusIn, options);
    root.addEventListener("focusout", this.boundFocusOut, options);
    root.addEventListener("input", this.boundInput, options);
    root.addEventListener("change", this.boundChange, options);
  }

  stop() {
    this.pauseActiveTimer();
    if (this.root) {
      const options: AddEventListenerOptions = { capture: true };
      this.root.removeEventListener("focusin", this.boundFocusIn, options);
      this.root.removeEventListener("focusout", this.boundFocusOut, options);
      this.root.removeEventListener("input", this.boundInput, options);
      this.root.removeEventListener("change", this.boundChange, options);
    }

    this.idleUnsubscribe?.();
    this.idleUnsubscribe = null;
    this.root = null;
    this.idleTracker = null;
    this.elementToQuestionId.clear();
    this.activeQuestionId = null;
  }

  setOnRevisit(handler: () => void) {
    this.onRevisit = handler;
  }

  refreshQuestions() {
    if (!this.root) return;

    const discovered = discoverQuestions(this.root);
    this.elementToQuestionId.clear();

    for (const question of discovered) {
      if (!this.states.has(question.id)) {
        this.states.set(question.id, createQuestionState(question.type));
      } else {
        const state = this.states.get(question.id);
        if (state) state.question_type = question.type;
      }

      for (const element of question.elements) {
        this.elementToQuestionId.set(element, question.id);
      }
    }
  }

  exportQuestions(): Record<string, QuestionAnalyticsExport> {
    this.pauseActiveTimer();
    this.refreshFinalAnswers();

    const output: Record<string, QuestionAnalyticsExport> = {};
    for (const [id, state] of this.states.entries()) {
      output[id] = {
        question_type: state.question_type,
        time_ms: Math.round(state.time_ms),
        edits: state.edits,
        visited: state.visited,
        skipped: !state.visited && !isAnswered(state.final_answer),
        revisited: state.revisited,
        final_answer: state.final_answer,
        start_time: state.start_time,
        end_time: state.end_time,
      };
    }

    return output;
  }

  getTotals() {
    this.refreshFinalAnswers();
    const questions = Array.from(this.states.values());
    const total = questions.length;
    const answered = questions.filter((question) =>
      isAnswered(question.final_answer),
    ).length;
    const skipped = questions.filter(
      (question) => !question.visited && !isAnswered(question.final_answer),
    ).length;

    return {
      total_questions: total,
      answered_questions: answered,
      skipped_questions: skipped,
      completion_percentage:
        total === 0 ? 0 : Math.round((answered / total) * 100),
    };
  }

  private handleFocusIn(event: FocusEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const questionId = this.elementToQuestionId.get(target);
    if (!questionId) return;

    if (this.activeQuestionId && this.activeQuestionId !== questionId) {
      this.pauseActiveTimer();
    }

    const state = this.ensureState(questionId, target);
    state.visit_count += 1;
    state.visited = true;

    if (state.visit_count > 1) {
      state.revisited = true;
      this.onRevisit?.();
    }

    if (!state.start_time) {
      state.start_time = nowIso();
    }

    this.activeQuestionId = questionId;
    if (!this.idleTracker?.getIsIdle()) {
      this.resumeActiveTimer(questionId);
    }
  }

  private handleFocusOut(event: FocusEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const questionId = this.elementToQuestionId.get(target);
    if (!questionId || questionId !== this.activeQuestionId) return;

    const related = event.relatedTarget;
    if (related instanceof HTMLElement) {
      const nextQuestionId = this.elementToQuestionId.get(related);
      if (nextQuestionId === questionId) return;
    }

    this.pauseActiveTimer();
    const state = this.states.get(questionId);
    if (state) {
      state.end_time = nowIso();
      state.final_answer = readQuestionAnswer({
        id: questionId,
        type: state.question_type,
        elements: this.getElementsForQuestion(questionId),
      });
    }
    this.activeQuestionId = null;
  }

  private handleEdit(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const questionId = this.elementToQuestionId.get(target);
    if (!questionId) return;

    const state = this.ensureState(questionId, target);
    state.edits += 1;
    state.final_answer = readQuestionAnswer({
      id: questionId,
      type: state.question_type,
      elements: this.getElementsForQuestion(questionId),
    });
    state.skipped = false;
  }

  private ensureState(questionId: string, element: HTMLElement): QuestionState {
    const existing = this.states.get(questionId);
    if (existing) return existing;

    const created = createQuestionState(getQuestionType(element));
    this.states.set(questionId, created);
    return created;
  }

  private getElementsForQuestion(questionId: string) {
    const elements: HTMLElement[] = [];
    for (const [element, id] of this.elementToQuestionId.entries()) {
      if (id === questionId) elements.push(element);
    }
    return elements;
  }

  private resumeActiveTimer(questionId: string) {
    const state = this.states.get(questionId);
    if (!state || state.active_since !== null) return;
    state.active_since = safePerformanceNow();
  }

  private pauseActiveTimer() {
    if (!this.activeQuestionId) return;

    const state = this.states.get(this.activeQuestionId);
    if (!state || state.active_since === null) return;

    state.time_ms += safePerformanceNow() - state.active_since;
    state.active_since = null;
  }

  private refreshFinalAnswers() {
    for (const [id, state] of this.states.entries()) {
      state.final_answer = readQuestionAnswer({
        id,
        type: state.question_type,
        elements: this.getElementsForQuestion(id),
      });
      state.skipped = !state.visited && !isAnswered(state.final_answer);
    }
  }
}

function createQuestionState(type: QuestionInputType): QuestionState {
  return {
    question_type: type,
    time_ms: 0,
    edits: 0,
    visited: false,
    skipped: true,
    revisited: false,
    visit_count: 0,
    final_answer: null,
    start_time: null,
    end_time: null,
    active_since: null,
  };
}
