(function () {
  "use strict";

  var fieldStartTimes = {};
  var fieldResponseTimes = {};
  var draftScreenTimes = {};
  var timingInstalled = false;
  var draftAutosave = null;
  var draftIdentity = "";

  function fieldToQ(name) {
    if (
      window.ConcaveFieldQKeyMap &&
      typeof window.ConcaveFieldQKeyMap.fieldToQ === "function"
    ) {
      return window.ConcaveFieldQKeyMap.fieldToQ(name);
    }
    return null;
  }

  function collectRawAnswers() {
    var answers = {};
    var names = new Set();

    // Prefer the form's in-memory ANSWERS store (covers tabbed / rebuilt UIs).
    if (typeof window.ANSWERS === "object" && window.ANSWERS) {
      Object.keys(window.ANSWERS).forEach(function (name) {
        if (name) names.add(name);
      });
    }

    document
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach(function (el) {
        if (el.type === "hidden" || el.type === "submit" || el.type === "button") {
          return;
        }
        names.add(el.name);
      });

    names.forEach(function (name) {
      var stored =
        typeof window.ANSWERS === "object" && window.ANSWERS
          ? window.ANSWERS[name]
          : undefined;

      var fields = document.querySelectorAll(
        'input[name="' +
          CSS.escape(name) +
          '"], select[name="' +
          CSS.escape(name) +
          '"], textarea[name="' +
          CSS.escape(name) +
          '"]',
      );

      if (fields.length) {
        var first = fields[0];
        if (first.type === "checkbox") {
          // Merge DOM checked values with off-tab values kept in ANSWERS.
          var onScreenVals = Array.from(fields).map(function (field) {
            return field.value;
          });
          var checkedNow = Array.from(fields)
            .filter(function (field) {
              return field.checked;
            })
            .map(function (field) {
              return field.value;
            });
          var prev = Array.isArray(stored) ? stored : [];
          var kept = prev.filter(function (v) {
            return onScreenVals.indexOf(v) === -1;
          });
          var values = kept.concat(checkedNow);
          if (values.length) answers[name] = values;
          return;
        }
        if (first.type === "radio") {
          var checked = Array.from(fields).find(function (field) {
            return field.checked;
          });
          if (checked) answers[name] = checked.value;
          else if (typeof stored === "string" && stored) answers[name] = stored;
          return;
        }
        var value = String(first.value || "").trim();
        if (value) answers[name] = value;
        else if (stored !== undefined && stored !== null && String(stored).trim()) {
          answers[name] = Array.isArray(stored) ? stored : String(stored).trim();
        }
        return;
      }

      // Field not currently in DOM — use ANSWERS only.
      if (stored === undefined || stored === null) return;
      if (Array.isArray(stored)) {
        if (stored.length) answers[name] = stored;
      } else if (String(stored).trim()) {
        answers[name] = String(stored).trim();
      }
    });

    return answers;
  }

  function collectSurveyAnswers() {
    var raw = collectRawAnswers();
    var answers = {};
    Object.keys(raw).forEach(function (name) {
      var qKey = fieldToQ(name);
      if (qKey) {
        // Prefer Q-keys like the screener bridge.
        if (/^q\d+$/i.test(qKey)) qKey = "Q" + qKey.slice(1);
        answers[qKey] = raw[name];
      }
    });
    // When the map misses fields, fall back to raw names so the server can map.
    if (Object.keys(answers).length === 0 && Object.keys(raw).length > 0) {
      answers = raw;
    } else {
      // Also keep unmapped field names so dynamic inputs are not dropped.
      Object.keys(raw).forEach(function (name) {
        if (!fieldToQ(name) && answers[name] === undefined) {
          answers[name] = raw[name];
        }
      });
    }

    if (
      window.__concaveFormSchema &&
      window.ConcaveNestByQuestion &&
      typeof window.ConcaveNestByQuestion.nestAnswersByQuestion === "function"
    ) {
      return window.ConcaveNestByQuestion.nestAnswersByQuestion(
        answers,
        window.__concaveFormSchema,
      );
    }

    return answers;
  }

  function startSurveyAnalytics() {
    try {
      if (
        window.SurveyAnalytics &&
        typeof window.SurveyAnalytics.start === "function"
      ) {
        var root =
          document.querySelector("form") ||
          document.querySelector("[data-survey-container]") ||
          document.body;
        window.SurveyAnalytics.start(root);
      }
    } catch (error) {
      console.warn("Survey analytics failed to start:", error);
    }
  }

  function exportSurveyAnalytics() {
    try {
      if (
        window.SurveyAnalytics &&
        typeof window.SurveyAnalytics.export === "function"
      ) {
        return window.SurveyAnalytics.export();
      }
    } catch (error) {
      console.warn("Survey analytics export failed:", error);
    }
    return null;
  }

  function mapAnalyticsResponseTimes(analytics) {
    if (!analytics || !analytics.questions) return null;

    var times = {};
    for (var fieldName in analytics.questions) {
      if (!Object.prototype.hasOwnProperty.call(analytics.questions, fieldName)) {
        continue;
      }
      var metrics = analytics.questions[fieldName];
      var qKey = fieldToQ(fieldName) || fieldName;
      if (/^q\d+$/i.test(qKey)) {
        qKey = "Q" + qKey.slice(1);
      }
      times[qKey] = Math.max(0, Math.round((metrics.time_ms || 0) / 1000));
    }
    return Object.keys(times).length > 0 ? times : null;
  }

  function mapFieldTimesToAnswerKeys(times) {
    var mapped = {};
    Object.keys(times || {}).forEach(function (name) {
      var seconds = times[name];
      if (typeof seconds !== "number" || !Number.isFinite(seconds)) return;
      // Prefer Q-keys; keep field names only as a fallback for server remap.
      var key = fieldToQ(name) || name;
      if (/^q\d+$/i.test(key)) {
        key = "Q" + key.slice(1);
      }
      mapped[key] = (mapped[key] || 0) + Math.max(0, Math.round(seconds));
    });
    return mapped;
  }

  function getLiveScreenTimes() {
    var live = Object.assign({}, fieldResponseTimes);
    Object.keys(fieldStartTimes).forEach(function (name) {
      var seconds = Math.max(
        0,
        Math.round((Date.now() - fieldStartTimes[name]) / 1000),
      );
      live[name] = (live[name] || 0) + seconds;
    });
    return live;
  }

  function recordScreenFieldTimes(screenEl) {
    if (!screenEl) return;
    var recorded = new Set();
    screenEl
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach(function (el) {
        var name = el.name;
        if (!name || recorded.has(name)) return;
        recorded.add(name);
        if (fieldStartTimes[name]) {
          var seconds = Math.max(
            0,
            Math.round((Date.now() - fieldStartTimes[name]) / 1000),
          );
          fieldResponseTimes[name] = (fieldResponseTimes[name] || 0) + seconds;
          delete fieldStartTimes[name];
        }
      });
  }

  function startScreenFieldTimers(screenEl) {
    if (!screenEl) return;
    var started = new Set();
    screenEl
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach(function (el) {
        var name = el.name;
        if (!name || started.has(name)) return;
        started.add(name);
        if (!fieldStartTimes[name]) {
          fieldStartTimes[name] = Date.now();
        }
      });
  }

  function installQuestionTiming() {
    if (timingInstalled) return;
    timingInstalled = true;

    document.addEventListener(
      "click",
      function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var navBtn = target.closest("[data-next], [data-back]");
        if (!navBtn) return;
        var visibleScreen =
          (window.ConcaveFormDraft &&
            window.ConcaveFormDraft.getVisibleScreen()) ||
          document.querySelector(".screen:not(.hidden)");
        if (visibleScreen) recordScreenFieldTimes(visibleScreen);
      },
      true,
    );

    var observer = new MutationObserver(function () {
      var visibleScreen =
        (window.ConcaveFormDraft &&
          window.ConcaveFormDraft.getVisibleScreen()) ||
        document.querySelector(".screen:not(.hidden)");
      if (visibleScreen) startScreenFieldTimers(visibleScreen);
    });

    document.querySelectorAll(".screen").forEach(function (screen) {
      observer.observe(screen, {
        attributes: true,
        attributeFilter: ["class"],
      });
    });

    var visibleScreen =
      (window.ConcaveFormDraft &&
        window.ConcaveFormDraft.getVisibleScreen()) ||
      document.querySelector(".screen:not(.hidden)");
    if (visibleScreen) startScreenFieldTimers(visibleScreen);
  }

  function mergeTimes(a, b) {
    if (
      window.ConcaveFormDraft &&
      typeof window.ConcaveFormDraft.mergeTimes === "function"
    ) {
      return window.ConcaveFormDraft.mergeTimes(a, b);
    }
    return Object.assign({}, a || {}, b || {});
  }

  function resolveResponseTimes(analytics) {
    var mapped = mapAnalyticsResponseTimes(analytics);
    var live = mapFieldTimesToAnswerKeys(getLiveScreenTimes());
    var merged = mergeTimes(draftScreenTimes, live);
    if (mapped && Object.keys(mapped).length > 0) {
      merged = mergeTimes(draftScreenTimes, mapped);
      merged = mergeTimes(merged, live);
    }
    return merged;
  }

  function getVisibleScreenId() {
    if (
      window.ConcaveFormDraft &&
      typeof window.ConcaveFormDraft.getVisibleScreenId === "function"
    ) {
      return window.ConcaveFormDraft.getVisibleScreenId();
    }
    var screen = document.querySelector(".screen:not(.hidden)");
    if (screen && screen.id) return screen.id;
    var active = document.querySelector("[data-survey-screen].active");
    if (active && active.id) return active.id;
    return "";
  }

  function collectSubmissionAnalytics() {
    var analytics = exportSurveyAnalytics();
    var screenId = getVisibleScreenId();
    return {
      analytics: analytics,
      responseTimes: resolveResponseTimes(analytics) || {},
      startedAt: analytics?.survey?.started_at || submitSurvey.startedAt,
      submittedAt: analytics?.survey?.submitted_at || new Date().toISOString(),
      currentScreen: screenId,
      lastScreen: screenId,
    };
  }

  function showSurveyError(message) {
    var existing = document.getElementById("survey-error");
    if (existing) existing.remove();

    var banner = document.createElement("div");
    banner.id = "survey-error";
    banner.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:#FDECEC;color:#8B1E1E;border:1px solid #F5B7B1;border-radius:12px;padding:14px 16px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.12)";
    banner.textContent = message;
    document.body.appendChild(banner);
  }

  function getSurveyTokenFromUrl() {
    return new URLSearchParams(window.location.search).get("t") || "";
  }

  function getSurveyDraftIdentity() {
    if (draftIdentity) return draftIdentity;
    if (
      typeof window.__concaveSurveyDraftId === "string" &&
      window.__concaveSurveyDraftId.trim()
    ) {
      return window.__concaveSurveyDraftId.trim();
    }
    // Legacy fallback while a token is still briefly in the URL (pre-redirect).
    return getSurveyTokenFromUrl();
  }

  function seedDraftScreenTimes(times) {
    draftScreenTimes =
      window.ConcaveFormDraft &&
      typeof window.ConcaveFormDraft.normalizeTimes === "function"
        ? window.ConcaveFormDraft.normalizeTimes(times)
        : Object.assign({}, times || {});
    Object.keys(draftScreenTimes).forEach(function (key) {
      fieldResponseTimes[key] = draftScreenTimes[key];
    });
  }

  function applySurveyDraft(draft) {
    if (!draft || !window.ConcaveFormDraft) return;
    var Draft = window.ConcaveFormDraft;
    if (draft.fields) Draft.restoreFields(draft.fields);
    seedDraftScreenTimes(draft._st || draft.screenTimes || {});

    document.querySelectorAll(".opts").forEach(function (scope) {
      scope.querySelectorAll(".opt").forEach(function (opt) {
        var inp = opt.querySelector("input");
        opt.classList.toggle("sel", Boolean(inp && inp.checked));
      });
    });

    if (typeof draft.__screen === "number") {
      Draft.restoreScreen(draft.__screen);
    } else if (draft._last_screen) {
      Draft.restoreScreen(draft._last_screen);
    }

    var visible = Draft.getVisibleScreen();
    if (visible) startScreenFieldTimers(visible);
  }

  function clearSurveyDraft() {
    var token = getSurveyDraftIdentity();
    if (
      token &&
      window.ConcaveFormDraft &&
      typeof window.ConcaveFormDraft.clear === "function"
    ) {
      window.ConcaveFormDraft.clear("survey", token);
    }
    draftScreenTimes = {};
  }

  function installSurveyDraft() {
    var Draft = window.ConcaveFormDraft;
    if (!Draft || draftAutosave) return;

    var identity = getSurveyDraftIdentity();
    if (!identity) return;
    draftIdentity = identity;

    var existing = Draft.load("survey", identity);
    if (existing) {
      applySurveyDraft(existing);
    }

    draftAutosave = Draft.attachAutosave({
      formType: "survey",
      getIdentity: function () {
        return getSurveyDraftIdentity();
      },
      getScreenTimes: function () {
        return mapFieldTimesToAnswerKeys(getLiveScreenTimes());
      },
      buildPayload: function () {
        return {
          fields: Draft.serializeFields(),
          __screen:
            typeof window.idx === "number"
              ? window.idx
              : Draft.getScreenIndex(),
          _last_screen: Draft.getVisibleScreenId(),
          _st: mapFieldTimesToAnswerKeys(getLiveScreenTimes()),
        };
      },
    });
  }

  async function submitSurvey() {
    if (submitSurvey.submitted) return;

    // Token is consumed into an httpOnly session on entry — do not require
    // ?t= in the URL (and never re-send the opaque token from the client).
    var visibleScreen =
      (window.ConcaveFormDraft &&
        window.ConcaveFormDraft.getVisibleScreen()) ||
      document.querySelector(".screen:not(.hidden)");
    if (visibleScreen) recordScreenFieldTimes(visibleScreen);
    if (draftAutosave && typeof draftAutosave.saveNow === "function") {
      draftAutosave.saveNow();
    }

    submitSurvey.submitted = true;

    try {
      var tracking = collectSubmissionAnalytics();
      var answers = collectSurveyAnswers();
      // Embed _st inside answers for checklist / export consumers.
      if (tracking.responseTimes && Object.keys(tracking.responseTimes).length) {
        answers = Object.assign({}, answers, { _st: tracking.responseTimes });
      }

      // Ensure timing values are integers (API rejects floats).
      var responseTimes = {};
      Object.keys(tracking.responseTimes || {}).forEach(function (key) {
        var n = Number(tracking.responseTimes[key]);
        if (Number.isFinite(n)) responseTimes[key] = Math.max(0, Math.round(n));
      });

      console.info("[survey-bridge] POST /api/survey", {
        answerKeys: Object.keys(answers).length,
        timeKeys: Object.keys(responseTimes).length,
      });

      var response = await fetch("/api/survey", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: answers,
          responseTimes: responseTimes,
          analytics: tracking.analytics || undefined,
          startedAt: tracking.startedAt,
          submittedAt: tracking.submittedAt,
          currentScreen: tracking.currentScreen,
          lastScreen: tracking.lastScreen,
        }),
      });

      var data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        submitSurvey.submitted = false;
        console.error("[survey-bridge] submit failed", response.status, data);
        showSurveyError(
          data.error ||
            "Survey submission failed (" + response.status + "). Please try again.",
        );
        return;
      }

      console.info("[survey-bridge] submit ok");
      clearSurveyDraft();
      // Thank-you is already visible; continue → preparing → UPI → confirmation.
      startPostSurveyUpiFlow();
    } catch (err) {
      submitSurvey.submitted = false;
      showSurveyError("Could not reach the server. Please try again.");
      console.error("Survey submit failed:", err);
    }
  }

  submitSurvey.submitted = false;
  submitSurvey.startedAt = new Date().toISOString();

  var UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/;

  function isValidUpiClient(value) {
    var trimmed = String(value || "").trim();
    if (!trimmed || trimmed.length > 320) return false;
    return UPI_ID_PATTERN.test(trimmed);
  }

  function removePostSurveyOverlay() {
    var existing = document.getElementById("concave-post-survey-flow");
    if (existing) existing.remove();
  }

  function ensurePostSurveyStyles() {
    if (document.getElementById("concave-post-survey-styles")) return;
    var style = document.createElement("style");
    style.id = "concave-post-survey-styles";
    style.textContent =
      "#concave-post-survey-flow{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(58,42,51,.45);backdrop-filter:blur(2px)}" +
      "#concave-post-survey-flow .ps-card{width:100%;max-width:22rem;border:1px solid #ECDDE2;border-radius:16px;background:#FBF7F8;padding:1.75rem 1.5rem;box-shadow:0 12px 40px rgba(58,42,51,.18);color:#3A2A33;font-family:system-ui,Segoe UI,sans-serif}" +
      "#concave-post-survey-flow .ps-badge{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 12px;background:#F6EEF1;color:#94838C;font-size:12px;font-weight:600;margin-bottom:14px}" +
      "#concave-post-survey-flow .ps-dot{width:8px;height:8px;border-radius:999px;background:#C97B8E;animation:ps-pulse 1.1s ease-in-out infinite}" +
      "@keyframes ps-pulse{0%,100%{opacity:.45}50%{opacity:1}}" +
      "#concave-post-survey-flow h2{margin:0 0 8px;font-size:1.2rem;line-height:1.35}" +
      "#concave-post-survey-flow p{margin:0;font-size:.9rem;line-height:1.55;color:#94838C}" +
      "#concave-post-survey-flow label{display:block;margin:18px 0 8px;font-size:13px;font-weight:600;color:#3A2A33}" +
      "#concave-post-survey-flow input{width:100%;box-sizing:border-box;border:1px solid #ECDDE2;border-radius:12px;padding:12px 14px;font-size:16px;background:#fff;color:#3A2A33}" +
      "#concave-post-survey-flow input:focus{outline:2px solid #C97B8E;outline-offset:1px}" +
      "#concave-post-survey-flow .ps-hint{margin-top:8px;font-size:12px;color:#94838C}" +
      "#concave-post-survey-flow .ps-error{margin-top:10px;font-size:13px;color:#8B1E1E;font-weight:600}" +
      "#concave-post-survey-flow .ps-ok{margin-top:10px;font-size:13px;color:#3E8E7E;font-weight:600}" +
      "#concave-post-survey-flow .ps-btn{margin-top:18px;width:100%;border:none;border-radius:12px;padding:13px 16px;font-size:15px;font-weight:600;background:#C97B8E;color:#fff;cursor:pointer}" +
      "#concave-post-survey-flow .ps-btn:disabled{opacity:.55;cursor:not-allowed}" +
      "#concave-post-survey-flow .ps-btn-secondary{background:#fff;color:#C97B8E;border:1px solid #C97B8E}";
    document.head.appendChild(style);
  }

  function renderPostSurveyCard(innerHtml) {
    ensurePostSurveyStyles();
    removePostSurveyOverlay();
    var overlay = document.createElement("div");
    overlay.id = "concave-post-survey-flow";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = '<div class="ps-card">' + innerHtml + "</div>";
    document.body.appendChild(overlay);
    return overlay;
  }

  function showPreparingNextStep() {
    renderPostSurveyCard(
      '<div class="ps-badge"><span class="ps-dot"></span> Almost done</div>' +
        "<h2>Preparing for next step…</h2>" +
        "<p>We’re getting your payout details screen ready.</p>",
    );
  }

  function showUpiInputScreen() {
    var overlay = renderPostSurveyCard(
      '<div class="ps-badge"><span class="ps-dot" style="animation:none"></span> Payout details</div>' +
        "<h2>Enter your UPI ID</h2>" +
        "<p>We’ll use this to send your survey reward.</p>" +
        '<label for="concave-upi-input">UPI ID</label>' +
        '<input id="concave-upi-input" type="text" inputmode="email" autocomplete="off" placeholder="name@okhdfc" maxlength="320" />' +
        '<p class="ps-hint">Format: name@bank (e.g. sample@okhdfc)</p>' +
        '<p class="ps-error" id="concave-upi-error" hidden></p>' +
        '<p class="ps-ok" id="concave-upi-ok" hidden></p>' +
        '<button type="button" class="ps-btn" id="concave-upi-save">Save UPI ID</button>',
    );

    var input = overlay.querySelector("#concave-upi-input");
    var errorEl = overlay.querySelector("#concave-upi-error");
    var okEl = overlay.querySelector("#concave-upi-ok");
    var saveBtn = overlay.querySelector("#concave-upi-save");
    if (input) setTimeout(function () { input.focus(); }, 50);

    function setError(message) {
      if (!errorEl) return;
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = "";
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = message;
      if (okEl) okEl.hidden = true;
    }

    async function saveUpi() {
      var raw = input ? input.value : "";
      var normalized = String(raw || "").trim().toLowerCase();
      setError("");
      if (!isValidUpiClient(normalized)) {
        setError("Enter a valid UPI ID like name@okhdfc");
        if (input) input.focus();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        var response = await fetch("/api/participant/upi", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upiId: normalized }),
        });
        var payload = await response.json().catch(function () {
          return {};
        });

        if (!response.ok) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save UPI ID";
          setError(
            payload.error ||
              "Could not save UPI. Please check and try again.",
          );
          return;
        }

        if (okEl) {
          okEl.hidden = false;
          okEl.textContent = "UPI saved successfully.";
        }
        setTimeout(showUpiSavedConfirmation, 600);
      } catch (err) {
        console.error("[survey-bridge] UPI save failed:", err);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save UPI ID";
        setError("Could not reach the server. Your entry is still here — retry.");
      }
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        void saveUpi();
      });
    }
    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          void saveUpi();
        }
      });
    }
  }

  function showUpiSavedConfirmation() {
    renderPostSurveyCard(
      '<div class="ps-badge"><span class="ps-dot" style="animation:none;background:#3E8E7E"></span> Done</div>' +
        "<h2>Thanks, payout details received</h2>" +
        "<p>We’ve saved your UPI ID. Your reward will be processed shortly.</p>" +
        '<button type="button" class="ps-btn" id="concave-upi-done">Close</button>',
    );
    var done = document.getElementById("concave-upi-done");
    if (done) {
      done.addEventListener("click", function () {
        removePostSurveyOverlay();
      });
    }
  }

  function startPostSurveyUpiFlow() {
    // Keep existing thank-you visible underneath; overlay the preparing step.
    showPreparingNextStep();
    setTimeout(function () {
      showUpiInputScreen();
    }, 1400);
  }

  function isThankYouScreen(id) {
    if (!id || typeof id !== "string") return false;
    var normalized = id.toLowerCase().replace(/^#/, "");
    return (
      normalized === "s-thankyou" ||
      normalized === "thankyou" ||
      normalized === "s-thank-you" ||
      normalized.indexOf("thankyou") !== -1
    );
  }

  window.ConcaveSurveyBridge = {
    attach: function (showResultFn) {
      console.info("[survey-bridge] ConcaveSurveyBridge.attach wired");
      installQuestionTiming();
      installSurveyDraft();
      startSurveyAnalytics();

      var form = document.querySelector("form");
      if (form) {
        form.addEventListener(
          "submit",
          function (event) {
            event.preventDefault();
            void submitSurvey();
          },
          true,
        );
      }

      if (typeof showResultFn !== "function") {
        // No showResult — still attempt submit if a thank-you screen is shown later.
        return showResultFn;
      }

      return function wrappedShowResult(id) {
        var visibleScreen =
          (window.ConcaveFormDraft &&
            window.ConcaveFormDraft.getVisibleScreen()) ||
          document.querySelector(".screen:not(.hidden)");
        if (visibleScreen) recordScreenFieldTimes(visibleScreen);
        if (draftAutosave && typeof draftAutosave.saveNow === "function") {
          draftAutosave.saveNow();
        }

        showResultFn(id);
        if (isThankYouScreen(id)) {
          void submitSurvey();
        }
      };
    },
  };
})();
