import { SurveyAnalytics } from "@/analytics/SurveyAnalytics";

declare global {
  interface Window {
    SurveyAnalytics?: typeof SurveyAnalytics;
  }
}

window.SurveyAnalytics = SurveyAnalytics;

function autoStartSurveyAnalytics() {
  const configured = document.querySelector<HTMLElement>("[data-survey-container]");
  const form = document.querySelector<HTMLFormElement>("form");
  const root = configured ?? form;

  if (root) {
    SurveyAnalytics.start(root);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoStartSurveyAnalytics, {
      once: true,
    });
  } else {
    autoStartSurveyAnalytics();
  }
}

export { SurveyAnalytics };
