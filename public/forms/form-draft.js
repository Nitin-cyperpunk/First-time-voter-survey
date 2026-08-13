/**
 * Shared autosave / resume / screen-timing helpers for registration + survey forms.
 * Drafts live in localStorage (48h TTL), keyed by form type + identity (mobile or survey token).
 */
(function () {
  "use strict";

  var DRAFT_TTL_MS = 48 * 60 * 60 * 1000;
  var SAVE_DEBOUNCE_MS = 400;
  var STORAGE_PREFIX = "concave.form_draft.";

  function now() {
    return Date.now();
  }

  function storageKey(formType, identity) {
    return (
      STORAGE_PREFIX +
      String(formType || "form") +
      "." +
      String(identity || "").trim().toLowerCase()
    );
  }

  function isExpired(payload) {
    if (!payload || typeof payload.savedAt !== "number") return true;
    return now() - payload.savedAt > DRAFT_TTL_MS;
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function save(formType, identity, payload) {
    if (!identity || typeof localStorage === "undefined") return false;
    try {
      var body = Object.assign({}, payload || {}, { savedAt: now() });
      localStorage.setItem(
        storageKey(formType, identity),
        JSON.stringify(body),
      );
      return true;
    } catch (_error) {
      console.warn("[ConcaveFormDraft] save failed", _error);
      return false;
    }
  }

  function load(formType, identity) {
    if (!identity || typeof localStorage === "undefined") return null;
    try {
      var raw = localStorage.getItem(storageKey(formType, identity));
      if (!raw) return null;
      var payload = safeParse(raw);
      if (!payload || isExpired(payload)) {
        localStorage.removeItem(storageKey(formType, identity));
        return null;
      }
      return payload;
    } catch (_error) {
      console.warn("[ConcaveFormDraft] load failed", _error);
      return null;
    }
  }

  function clear(formType, identity) {
    if (!identity || typeof localStorage === "undefined") return false;
    try {
      localStorage.removeItem(storageKey(formType, identity));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function serializeFields(root) {
    var scope = root || document;
    var fields = {};
    scope
      .querySelectorAll("input[type=radio]:checked")
      .forEach(function (el) {
        if (el.name) fields[el.name] = el.value;
      });
    var multi = {};
    scope
      .querySelectorAll("input[type=checkbox]:checked")
      .forEach(function (el) {
        if (!el.name) return;
        (multi[el.name] = multi[el.name] || []).push(el.value);
      });
    Object.keys(multi).forEach(function (name) {
      fields[name] = multi[name];
    });
    scope
      .querySelectorAll(
        "input[type=text],input[type=tel],input[type=email],input[type=number],input[type=date],input[type=range],textarea,select",
      )
      .forEach(function (el) {
        if (!el.name) return;
        if (el.type === "checkbox" || el.type === "radio") return;
        var value = String(el.value || "");
        if (value !== "") fields[el.name] = value;
      });
    return fields;
  }

  function restoreFields(fields, root) {
    if (!fields || typeof fields !== "object") return;
    var scope = root || document;
    Object.keys(fields).forEach(function (name) {
      var val = fields[name];
      if (Array.isArray(val)) {
        val.forEach(function (v) {
          var el = scope.querySelector(
            'input[name="' +
              CSS.escape(name) +
              '"][value="' +
              CSS.escape(String(v)) +
              '"]',
          );
          if (el) el.checked = true;
        });
        return;
      }
      var radios = scope.querySelectorAll(
        'input[type=radio][name="' + CSS.escape(name) + '"]',
      );
      if (radios.length) {
        radios.forEach(function (r) {
          r.checked = r.value === String(val);
        });
        return;
      }
      var el = scope.querySelector('[name="' + CSS.escape(name) + '"]');
      if (el) el.value = String(val);
    });
  }

  function getVisibleScreen() {
    return (
      document.querySelector(".screen:not(.hidden)") ||
      document.querySelector("[data-survey-screen].active") ||
      null
    );
  }

  function getVisibleScreenId() {
    var screen = getVisibleScreen();
    return screen && screen.id ? screen.id : "";
  }

  function getScreenIndex() {
    if (typeof window.idx === "number") return window.idx;
    var screens = document.querySelectorAll(".screen");
    var visible = getVisibleScreen();
    if (!visible || !screens.length) return 0;
    for (var i = 0; i < screens.length; i += 1) {
      if (screens[i] === visible) return i;
    }
    return 0;
  }

  function restoreScreen(screenIdOrIndex) {
    if (
      typeof window.showScreen === "function" &&
      Array.isArray(window.SCREENS) &&
      typeof screenIdOrIndex === "number" &&
      Number.isFinite(screenIdOrIndex) &&
      screenIdOrIndex >= 0 &&
      screenIdOrIndex < window.SCREENS.length
    ) {
      window.showScreen(screenIdOrIndex);
      return true;
    }

    if (
      typeof window.showScreen === "function" &&
      Array.isArray(window.SCREENS) &&
      typeof screenIdOrIndex === "string" &&
      screenIdOrIndex
    ) {
      var index = window.SCREENS.indexOf(screenIdOrIndex);
      if (index >= 0) {
        window.showScreen(index);
        return true;
      }
    }

    if (typeof screenIdOrIndex === "string" && screenIdOrIndex) {
      var target = document.getElementById(screenIdOrIndex);
      if (target) {
        document.querySelectorAll(".screen").forEach(function (screen) {
          screen.classList.add("hidden");
        });
        target.classList.remove("hidden");
        window.scrollTo(0, 0);
        return true;
      }
    }

    if (
      typeof window.showScreen === "function" &&
      typeof screenIdOrIndex === "number"
    ) {
      window.showScreen(screenIdOrIndex);
      return true;
    }

    return false;
  }

  function mergeTimes(base, extra) {
    var out = {};
    if (base && typeof base === "object") {
      Object.keys(base).forEach(function (key) {
        var value = base[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          out[key] = Math.round(value);
        }
      });
    }
    if (extra && typeof extra === "object") {
      Object.keys(extra).forEach(function (key) {
        var value = extra[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          out[key] = (out[key] || 0) + Math.round(value);
        }
      });
    }
    return out;
  }

  function normalizeTimes(times) {
    return mergeTimes(times, null);
  }

  function attachAutosave(options) {
    var opts = options || {};
    var formType = opts.formType || "form";
    var debounceMs =
      typeof opts.debounceMs === "number" ? opts.debounceMs : SAVE_DEBOUNCE_MS;
    var timer = null;
    var destroyed = false;

    function resolveIdentity() {
      if (typeof opts.getIdentity === "function") {
        return String(opts.getIdentity() || "").trim();
      }
      return "";
    }

    function buildPayload() {
      var base =
        typeof opts.buildPayload === "function" ? opts.buildPayload() : {};
      return Object.assign(
        {
          fields: serializeFields(),
          __screen: getScreenIndex(),
          _last_screen: getVisibleScreenId(),
          _st: normalizeTimes(opts.getScreenTimes ? opts.getScreenTimes() : {}),
        },
        base || {},
      );
    }

    function flush() {
      if (destroyed) return;
      var identity = resolveIdentity();
      if (!identity) return;
      if (typeof opts.shouldSave === "function" && !opts.shouldSave(identity)) {
        return;
      }
      save(formType, identity, buildPayload());
      if (typeof opts.onSaved === "function") opts.onSaved(identity);
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    }

    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("[data-next], [data-back]")) {
          // Capture leaving-screen state promptly.
          flush();
        }
      },
      true,
    );

    return {
      saveNow: flush,
      destroy: function () {
        destroyed = true;
        clearTimeout(timer);
      },
    };
  }

  // Optional hooks used by FormStore stubs in bundled HTML.
  window.supabaseSaveDraft = function (mobile, payload) {
    return save("registration", mobile, payload);
  };
  window.supabaseLoadDraft = function (mobile) {
    return load("registration", mobile);
  };
  window.supabaseClearDraft = function (mobile) {
    return clear("registration", mobile);
  };

  window.ConcaveFormDraft = {
    DRAFT_TTL_MS: DRAFT_TTL_MS,
    storageKey: storageKey,
    save: save,
    load: load,
    clear: clear,
    serializeFields: serializeFields,
    restoreFields: restoreFields,
    getVisibleScreen: getVisibleScreen,
    getVisibleScreenId: getVisibleScreenId,
    getScreenIndex: getScreenIndex,
    restoreScreen: restoreScreen,
    mergeTimes: mergeTimes,
    normalizeTimes: normalizeTimes,
    attachAutosave: attachAutosave,
  };
})();
