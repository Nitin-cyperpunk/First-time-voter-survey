export type QuestionInputType =
  | "text"
  | "textarea"
  | "radio"
  | "checkbox"
  | "select"
  | "range"
  | "date"
  | "email"
  | "tel"
  | "number"
  | "unknown";

export type QuestionAnalyticsExport = {
  question_type: QuestionInputType;
  time_ms: number;
  edits: number;
  visited: boolean;
  skipped: boolean;
  revisited: boolean;
  final_answer: string | string[] | null;
  start_time: string | null;
  end_time: string | null;
};

export type SurveyBehaviourExport = {
  first_interaction_at: string | null;
  focus_events: number;
  blur_events: number;
  change_events: number;
  input_events: number;
  revisit_events: number;
  back_navigation_events: number;
  tab_hidden_events: number;
  tab_visible_events: number;
  window_blur_events: number;
  window_focus_events: number;
  refresh_attempts: number;
};

export type SurveyAnalyticsExport = {
  survey: {
    started_at: string;
    submitted_at: string | null;
    completion_time_ms: number;
    idle_time_ms: number;
    active_time_ms: number;
    total_questions: number;
    answered_questions: number;
    skipped_questions: number;
    completion_percentage: number;
    behaviour: SurveyBehaviourExport;
  };
  questions: Record<string, QuestionAnalyticsExport>;
};

export type DiscoveredQuestion = {
  id: string;
  type: QuestionInputType;
  elements: HTMLElement[];
};
