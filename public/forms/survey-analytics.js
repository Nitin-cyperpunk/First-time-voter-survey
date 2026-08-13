(function () {
  "use strict";

  var FIELD_SELECTOR = [
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
    "select",
    "textarea",
  ].join(",");
  var IDLE_THRESHOLD_MS = 30000;

  function nowIso() {
    return new Date().toISOString();
  }

  function now() {
    return window.performance && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function getType(element) {
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLSelectElement) return "select";
    if (element instanceof HTMLInputElement) {
      return [
        "radio",
        "checkbox",
        "range",
        "date",
        "email",
        "tel",
        "number",
      ].includes(element.type)
        ? element.type
        : "text";
    }
    return "unknown";
  }

  function questionId(element, fallbackIndex) {
    return (
      (element.getAttribute("data-question-id") || "").trim() ||
      (element.getAttribute("name") || "").trim() ||
      (element.getAttribute("id") || "").trim() ||
      "q_auto_" + (fallbackIndex + 1)
    );
  }

  function discover(root) {
    var elements = Array.prototype.slice
      .call(root.querySelectorAll(FIELD_SELECTOR))
      .filter(function (element) {
        return !element.disabled;
      });
    var grouped = new Map();

    elements.forEach(function (element) {
      var type = getType(element);
      var id = questionId(element, grouped.size);
      var key =
        (type === "radio" || type === "checkbox") && element.name
          ? element.name
          : id;
      var current = grouped.get(key);

      if (current) {
        current.elements.push(element);
      } else {
        grouped.set(key, { id: key, type: type, elements: [element] });
      }
    });

    return Array.from(grouped.values());
  }

  function answerFor(question) {
    var first = question.elements[0];
    if (!first) return null;

    if (question.type === "checkbox") {
      var values = question.elements
        .filter(function (element) {
          return element.checked;
        })
        .map(function (element) {
          return element.value;
        });
      return values.length ? values : null;
    }

    if (question.type === "radio") {
      var checked = question.elements.find(function (element) {
        return element.checked;
      });
      return checked ? checked.value : null;
    }

    var value = String(first.value || "").trim();
    return value ? value : null;
  }

  function answered(value) {
    return Array.isArray(value) ? value.length > 0 : !!value;
  }

  function Engine() {
    this.root = null;
    this.startedAt = null;
    this.startedAtPerf = 0;
    this.submittedAt = null;
    this.questions = new Map();
    this.elementToQuestion = new Map();
    this.activeQuestionId = null;
    this.idle = false;
    this.idleStartedAt = null;
    this.totalIdleMs = 0;
    this.idleTimeout = null;
    this.observer = null;
    this.running = false;
    this.behaviour = this.emptyBehaviour();
  }

  Engine.prototype.emptyBehaviour = function () {
    return {
      first_interaction_at: null,
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
  };

  Engine.prototype.start = function (element) {
    try {
      this.stop();
      this.root =
        element instanceof HTMLFormElement
          ? element
          : element.querySelector("form") || element;
      this.startedAt = nowIso();
      this.startedAtPerf = now();
      this.submittedAt = null;
      this.behaviour = this.emptyBehaviour();
      this.running = true;
      this.refreshQuestions();
      this.installListeners();
      this.installObserver();
      this.scheduleIdle();
    } catch (error) {
      console.warn("[SurveyAnalytics] start failed:", error);
    }
  };

  Engine.prototype.stop = function () {
    if (!this.running) return;
    this.pauseActiveQuestion();
    this.finishIdle();
    this.removeListeners();
    if (this.observer) this.observer.disconnect();
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.root = null;
    this.activeQuestionId = null;
    this.observer = null;
    this.idleTimeout = null;
    this.running = false;
  };

  Engine.prototype.reset = function () {
    this.stop();
    this.questions.clear();
    this.elementToQuestion.clear();
    this.startedAt = null;
    this.startedAtPerf = 0;
    this.submittedAt = null;
    this.totalIdleMs = 0;
    this.behaviour = this.emptyBehaviour();
  };

  Engine.prototype.refreshQuestions = function () {
    var self = this;
    if (!this.root) return;

    this.elementToQuestion.clear();
    discover(this.root).forEach(function (question) {
      if (!self.questions.has(question.id)) {
        self.questions.set(question.id, {
          question_type: question.type,
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
        });
      }

      question.elements.forEach(function (element) {
        self.elementToQuestion.set(element, question.id);
      });
    });
  };

  Engine.prototype.installListeners = function () {
    var self = this;
    this.onFocusIn = function (event) {
      self.markInteraction();
      self.behaviour.focus_events += 1;
      self.activate(event.target);
    };
    this.onFocusOut = function (event) {
      self.behaviour.blur_events += 1;
      self.deactivate(event.target, event.relatedTarget);
    };
    this.onInput = function (event) {
      self.markInteraction();
      self.behaviour.input_events += 1;
      self.edit(event.target);
    };
    this.onChange = function (event) {
      self.markInteraction();
      self.behaviour.change_events += 1;
      self.edit(event.target);
    };
    this.onSubmit = function () {
      self.submittedAt = nowIso();
    };
    this.onActivity = function () {
      self.markInteraction();
      if (self.idle) {
        self.finishIdle();
        self.idle = false;
        if (self.activeQuestionId) self.resumeActiveQuestion(self.activeQuestionId);
      }
      self.scheduleIdle();
    };
    this.onVisibility = function () {
      if (document.visibilityState === "hidden") {
        self.behaviour.tab_hidden_events += 1;
        self.pauseActiveQuestion();
      } else {
        self.behaviour.tab_visible_events += 1;
        if (self.activeQuestionId && !self.idle) {
          self.resumeActiveQuestion(self.activeQuestionId);
        }
      }
    };
    this.onBeforeUnload = function () {
      self.behaviour.refresh_attempts += 1;
    };
    this.onPopState = function () {
      self.behaviour.back_navigation_events += 1;
    };
    this.onWindowFocus = function () {
      self.behaviour.window_focus_events += 1;
    };
    this.onWindowBlur = function () {
      self.behaviour.window_blur_events += 1;
      self.pauseActiveQuestion();
    };

    var options = { capture: true, passive: true };
    this.root.addEventListener("focusin", this.onFocusIn, true);
    this.root.addEventListener("focusout", this.onFocusOut, true);
    this.root.addEventListener("input", this.onInput, true);
    this.root.addEventListener("change", this.onChange, true);
    this.root.addEventListener("pointerdown", this.onActivity, options);
    this.root.addEventListener("keydown", this.onActivity, true);
    if (this.root instanceof HTMLFormElement) {
      this.root.addEventListener("submit", this.onSubmit, true);
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("beforeunload", this.onBeforeUnload);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("focus", this.onWindowFocus);
    window.addEventListener("blur", this.onWindowBlur);
  };

  Engine.prototype.removeListeners = function () {
    if (!this.root || !this.onFocusIn) return;
    this.root.removeEventListener("focusin", this.onFocusIn, true);
    this.root.removeEventListener("focusout", this.onFocusOut, true);
    this.root.removeEventListener("input", this.onInput, true);
    this.root.removeEventListener("change", this.onChange, true);
    this.root.removeEventListener("pointerdown", this.onActivity, true);
    this.root.removeEventListener("keydown", this.onActivity, true);
    this.root.removeEventListener("submit", this.onSubmit, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("focus", this.onWindowFocus);
    window.removeEventListener("blur", this.onWindowBlur);
  };

  Engine.prototype.installObserver = function () {
    var self = this;
    if (!window.MutationObserver || !this.root) return;
    this.observer = new MutationObserver(function () {
      var run = function () {
        self.refreshQuestions();
      };
      if (window.requestIdleCallback) {
        window.requestIdleCallback(run, { timeout: 250 });
      } else {
        setTimeout(run, 0);
      }
    });
    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "name", "id", "data-question-id", "class"],
    });
  };

  Engine.prototype.markInteraction = function () {
    if (!this.behaviour.first_interaction_at) {
      this.behaviour.first_interaction_at = nowIso();
    }
  };

  Engine.prototype.scheduleIdle = function () {
    var self = this;
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(function () {
      if (!self.idle) {
        self.idle = true;
        self.idleStartedAt = now();
        self.pauseActiveQuestion();
      }
    }, IDLE_THRESHOLD_MS);
  };

  Engine.prototype.finishIdle = function () {
    if (this.idle && this.idleStartedAt !== null) {
      this.totalIdleMs += now() - this.idleStartedAt;
      this.idleStartedAt = null;
    }
  };

  Engine.prototype.activate = function (target) {
    if (!(target instanceof HTMLElement)) return;
    var id = this.elementToQuestion.get(target);
    if (!id) return;
    if (this.activeQuestionId && this.activeQuestionId !== id) {
      this.pauseActiveQuestion();
    }

    var state = this.questions.get(id);
    if (!state) return;
    state.visit_count += 1;
    state.visited = true;
    if (state.visit_count > 1) {
      state.revisited = true;
      this.behaviour.revisit_events += 1;
    }
    if (!state.start_time) state.start_time = nowIso();
    this.activeQuestionId = id;
    if (!this.idle) this.resumeActiveQuestion(id);
  };

  Engine.prototype.deactivate = function (target, relatedTarget) {
    if (!(target instanceof HTMLElement)) return;
    var id = this.elementToQuestion.get(target);
    if (!id || id !== this.activeQuestionId) return;
    if (
      relatedTarget instanceof HTMLElement &&
      this.elementToQuestion.get(relatedTarget) === id
    ) {
      return;
    }
    this.pauseActiveQuestion();
    var state = this.questions.get(id);
    if (state) {
      state.end_time = nowIso();
      state.final_answer = this.answer(id);
    }
    this.activeQuestionId = null;
  };

  Engine.prototype.edit = function (target) {
    if (!(target instanceof HTMLElement)) return;
    var id = this.elementToQuestion.get(target);
    if (!id) return;
    var state = this.questions.get(id);
    if (!state) return;
    state.edits += 1;
    state.final_answer = this.answer(id);
    state.skipped = false;
  };

  Engine.prototype.elementsFor = function (id) {
    var elements = [];
    this.elementToQuestion.forEach(function (questionId, element) {
      if (questionId === id) elements.push(element);
    });
    return elements;
  };

  Engine.prototype.answer = function (id) {
    var state = this.questions.get(id);
    if (!state) return null;
    return answerFor({
      id: id,
      type: state.question_type,
      elements: this.elementsFor(id),
    });
  };

  Engine.prototype.resumeActiveQuestion = function (id) {
    var state = this.questions.get(id);
    if (!state || state.active_since !== null) return;
    state.active_since = now();
  };

  Engine.prototype.pauseActiveQuestion = function () {
    if (!this.activeQuestionId) return;
    var state = this.questions.get(this.activeQuestionId);
    if (!state || state.active_since === null) return;
    state.time_ms += now() - state.active_since;
    state.active_since = null;
  };

  Engine.prototype.currentIdleMs = function () {
    return this.idle && this.idleStartedAt !== null
      ? this.totalIdleMs + (now() - this.idleStartedAt)
      : this.totalIdleMs;
  };

  Engine.prototype.export = function () {
    try {
      if (!this.running || !this.startedAt) return null;
      this.pauseActiveQuestion();

      var questions = {};
      var total = 0;
      var answeredCount = 0;
      var skippedCount = 0;

      this.questions.forEach(
        function (state, id) {
          var finalAnswer = this.answer(id);
          var isAnswered = answered(finalAnswer);
          var skipped = !state.visited && !isAnswered;
          total += 1;
          if (isAnswered) answeredCount += 1;
          if (skipped) skippedCount += 1;
          questions[id] = {
            question_type: state.question_type,
            time_ms: Math.round(state.time_ms),
            edits: state.edits,
            visited: state.visited,
            skipped: skipped,
            revisited: state.revisited,
            final_answer: finalAnswer,
            start_time: state.start_time,
            end_time: state.end_time,
          };
        }.bind(this),
      );

      var completionTimeMs = Math.max(0, Math.round(now() - this.startedAtPerf));
      var idleTimeMs = Math.round(this.currentIdleMs());
      var submittedAt = this.submittedAt || nowIso();
      this.submittedAt = submittedAt;

      return {
        survey: {
          started_at: this.startedAt,
          submitted_at: submittedAt,
          completion_time_ms: completionTimeMs,
          idle_time_ms: idleTimeMs,
          active_time_ms: Math.max(0, completionTimeMs - idleTimeMs),
          total_questions: total,
          answered_questions: answeredCount,
          skipped_questions: skippedCount,
          completion_percentage: total
            ? Math.round((answeredCount / total) * 100)
            : 0,
          behaviour: Object.assign({}, this.behaviour),
        },
        questions: questions,
      };
    } catch (error) {
      console.warn("[SurveyAnalytics] export failed:", error);
      return null;
    }
  };

  var engine = new Engine();
  window.SurveyAnalytics = {
    start: function (form) {
      engine.start(form);
    },
    stop: function () {
      engine.stop();
    },
    export: function () {
      return engine.export();
    },
    reset: function () {
      engine.reset();
    },
  };

  function autoStart() {
    var root =
      document.querySelector("[data-survey-container]") ||
      document.querySelector("form");
    if (root) window.SurveyAnalytics.start(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoStart, { once: true });
  } else {
    autoStart();
  }
})();
