import type { DiscoveredQuestion, QuestionInputType } from "@/analytics/types";

const FIELD_SELECTOR = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
  "select",
  "textarea",
].join(",");

const GROUPED_TYPES = new Set(["radio", "checkbox"]);

export function resolveSurveyRoot(element: HTMLElement): HTMLElement {
  if (element instanceof HTMLFormElement) {
    return element;
  }

  const nestedForm = element.querySelector("form");
  if (nestedForm instanceof HTMLFormElement) {
    return nestedForm;
  }

  return element;
}

export function discoverQuestions(root: HTMLElement): DiscoveredQuestion[] {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
  ).filter((element) => !element.hasAttribute("disabled"));

  const grouped = new Map<string, DiscoveredQuestion>();

  for (const element of elements) {
    const type = getQuestionType(element);
    const id = getStableQuestionId(element, grouped.size);

    if (GROUPED_TYPES.has(type)) {
      const name = element.getAttribute("name") ?? id;
      const existing = grouped.get(name);
      if (existing) {
        existing.elements.push(element);
        continue;
      }

      grouped.set(name, { id: name, type, elements: [element] });
      continue;
    }

    if (grouped.has(id)) {
      grouped.get(id)?.elements.push(element);
      continue;
    }

    grouped.set(id, { id, type, elements: [element] });
  }

  return Array.from(grouped.values());
}

export function getStableQuestionId(element: HTMLElement, fallbackIndex: number): string {
  const dataId = element.getAttribute("data-question-id")?.trim();
  if (dataId) return dataId;

  const name = element.getAttribute("name")?.trim();
  if (name) return name;

  const id = element.getAttribute("id")?.trim();
  if (id) return id;

  return `q_auto_${fallbackIndex + 1}`;
}

export function getQuestionType(element: HTMLElement): QuestionInputType {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";

  if (element instanceof HTMLInputElement) {
    switch (element.type) {
      case "radio":
        return "radio";
      case "checkbox":
        return "checkbox";
      case "range":
        return "range";
      case "date":
        return "date";
      case "email":
        return "email";
      case "tel":
        return "tel";
      case "number":
        return "number";
      default:
        return "text";
    }
  }

  return "unknown";
}

export function readQuestionAnswer(question: DiscoveredQuestion): string | string[] | null {
  const first = question.elements[0];
  if (!first) return null;

  if (question.type === "checkbox") {
    const values = question.elements
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
      .filter((element) => element.checked)
      .map((element) => element.value);
    return values.length > 0 ? values : null;
  }

  if (question.type === "radio") {
    const checked = question.elements.find(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && element.checked,
    );
    return checked?.value ?? null;
  }

  if (first instanceof HTMLSelectElement) {
    const value = first.value?.trim();
    return value ? value : null;
  }

  if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
    const value = first.value?.trim();
    return value ? value : null;
  }

  return null;
}

export function isAnswered(answer: string | string[] | null): boolean {
  if (answer === null) return false;
  if (Array.isArray(answer)) return answer.length > 0;
  return answer.length > 0;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function safePerformanceNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export { FIELD_SELECTOR };
