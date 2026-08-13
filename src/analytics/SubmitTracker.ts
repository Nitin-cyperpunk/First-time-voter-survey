type SubmitHandler = () => void;

export class SubmitTracker {
  private form: HTMLFormElement | null = null;
  private onSubmit: SubmitHandler | null = null;
  private boundSubmit: (event: Event) => void;
  private boundBeforeUnload: () => void;
  private boundPopState: () => void;
  private boundVisibility: () => void;
  private boundWindowFocus: () => void;
  private boundWindowBlur: () => void;
  private started = false;

  private root: HTMLElement | null = null;

  private behaviour = {
    first_interaction_at: null as string | null,
    focus_events: 0,
    blur_events: 0,
    change_events: 0,
    input_events: 0,
    revisit_events: 0,
    back_navigation_events: 0,
    tab_hidden_events: 0,
    tab_visible_events: 0,
    window_blur_events: 0,
    window_focus_events: 0,
    refresh_attempts: 0,
  };

  constructor() {
    this.boundSubmit = () => this.onSubmit?.();
    this.boundBeforeUnload = () => {
      this.behaviour.refresh_attempts += 1;
    };
    this.boundPopState = () => {
      this.behaviour.back_navigation_events += 1;
    };
    this.boundVisibility = () => {
      if (document.visibilityState === "hidden") {
        this.behaviour.tab_hidden_events += 1;
      } else {
        this.behaviour.tab_visible_events += 1;
      }
    };
    this.boundWindowFocus = () => {
      this.behaviour.window_focus_events += 1;
    };
    this.boundWindowBlur = () => {
      this.behaviour.window_blur_events += 1;
    };
  }

  start(root: HTMLElement, onSubmit: SubmitHandler) {
    if (this.started) return;
    this.started = true;
    this.root = root;
    this.onSubmit = onSubmit;
    this.form =
      root instanceof HTMLFormElement
        ? root
        : root.querySelector("form");

    const options: AddEventListenerOptions = { capture: true };
    root.addEventListener("focusin", this.trackFocus, options);
    root.addEventListener("focusout", this.trackBlur, options);
    root.addEventListener("input", this.trackInput, options);
    root.addEventListener("change", this.trackChange, options);
    this.form?.addEventListener("submit", this.boundSubmit, options);

    window.addEventListener("beforeunload", this.boundBeforeUnload);
    window.addEventListener("popstate", this.boundPopState);
    document.addEventListener("visibilitychange", this.boundVisibility);
    window.addEventListener("focus", this.boundWindowFocus);
    window.addEventListener("blur", this.boundWindowBlur);
  }

  stop() {
    if (!this.started) return;
    this.started = false;

    if (this.root) {
      const options: AddEventListenerOptions = { capture: true };
      this.root.removeEventListener("focusin", this.trackFocus, options);
      this.root.removeEventListener("focusout", this.trackBlur, options);
      this.root.removeEventListener("input", this.trackInput, options);
      this.root.removeEventListener("change", this.trackChange, options);
    }

    this.form?.removeEventListener("submit", this.boundSubmit, { capture: true });
    this.form = null;
    this.root = null;
    this.onSubmit = null;

    window.removeEventListener("beforeunload", this.boundBeforeUnload);
    window.removeEventListener("popstate", this.boundPopState);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    window.removeEventListener("focus", this.boundWindowFocus);
    window.removeEventListener("blur", this.boundWindowBlur);
  }

  markFirstInteraction() {
    if (!this.behaviour.first_interaction_at) {
      this.behaviour.first_interaction_at = new Date().toISOString();
    }
  }

  markRevisit() {
    this.behaviour.revisit_events += 1;
  }

  exportBehaviour() {
    return { ...this.behaviour };
  }

  private trackFocus = () => {
    this.markFirstInteraction();
    this.behaviour.focus_events += 1;
  };

  private trackBlur = () => {
    this.behaviour.blur_events += 1;
  };

  private trackInput = () => {
    this.markFirstInteraction();
    this.behaviour.input_events += 1;
  };

  private trackChange = () => {
    this.markFirstInteraction();
    this.behaviour.change_events += 1;
  };
}
