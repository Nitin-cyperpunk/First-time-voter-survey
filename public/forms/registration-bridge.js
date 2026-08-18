(function () {
  "use strict";

  const CORE_FIELDS = new Set([
    "city",
    "city_id",
    "email",
    "area",
    "zip",
    "age_band",
  ]);

  const fieldStartTimes = {};
  const fieldResponseTimes = {};
  /** Timing restored from a draft; merged into submit payload. */
  let draftScreenTimes = {};
  let timingInstalled = false;
  let draftAutosave = null;
  let draftIdentity = "";

  function fieldToQ(name) {
    if (
      window.ConcaveFieldQKeyMap &&
      typeof window.ConcaveFieldQKeyMap.fieldToQ === "function"
    ) {
      return window.ConcaveFieldQKeyMap.fieldToQ(name);
    }
    if (
      window.__concaveFieldQKeyMap &&
      typeof window.__concaveFieldQKeyMap === "object"
    ) {
      return window.__concaveFieldQKeyMap[name] || null;
    }
    return null;
  }

  function recordScreenFieldTimes(screenEl) {
    const recorded = new Set();
    screenEl
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach((el) => {
        if (CORE_FIELDS.has(el.name) || el.name.startsWith("dob_")) return;
        const name = el.name;
        if (recorded.has(name)) return;
        recorded.add(name);
        if (fieldStartTimes[name]) {
          const seconds = Math.max(
            0,
            Math.round((Date.now() - fieldStartTimes[name]) / 1000),
          );
          // Accumulate when revisiting a screen (Previous → Next).
          fieldResponseTimes[name] = (fieldResponseTimes[name] || 0) + seconds;
          delete fieldStartTimes[name];
        }
      });
  }

  function startScreenFieldTimers(screenEl) {
    const started = new Set();
    screenEl
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach((el) => {
        if (CORE_FIELDS.has(el.name) || el.name.startsWith("dob_")) return;
        const name = el.name;
        if (started.has(name)) return;
        started.add(name);
        // Resume timer only if not already running for this visit.
        if (!fieldStartTimes[name]) {
          fieldStartTimes[name] = Date.now();
        }
      });
  }

  function getLiveScreenTimes() {
    const live = Object.assign({}, fieldResponseTimes);
    Object.keys(fieldStartTimes).forEach((name) => {
      const seconds = Math.max(
        0,
        Math.round((Date.now() - fieldStartTimes[name]) / 1000),
      );
      live[name] = (live[name] || 0) + seconds;
    });
    return live;
  }

  function mapFieldTimesToAnswerKeys(times) {
    const mapped = {};
    Object.entries(times || {}).forEach(([name, seconds]) => {
      const qKey = fieldToQ(name);
      const key = qKey || name;
      if (CORE_FIELDS.has(name) || name.startsWith("dob_")) return;
      if (typeof seconds !== "number" || !Number.isFinite(seconds)) return;
      mapped[key] = (mapped[key] || 0) + Math.max(0, Math.round(seconds));
    });
    return mapped;
  }

  function seedDraftScreenTimes(times) {
    draftScreenTimes =
      window.ConcaveFormDraft &&
      typeof window.ConcaveFormDraft.normalizeTimes === "function"
        ? window.ConcaveFormDraft.normalizeTimes(times)
        : Object.assign({}, times || {});

    // Seed field-level timers so Previous/Next accumulation continues.
    Object.entries(draftScreenTimes).forEach(([key, seconds]) => {
      fieldResponseTimes[key] = seconds;
    });
  }

  function applyRegistrationDraft(draft) {
    if (!draft) return;
    const Draft = window.ConcaveFormDraft;
    if (!Draft) return;

    if (draft.fields) Draft.restoreFields(draft.fields);
    seedDraftScreenTimes(draft._st || draft.screenTimes || {});

    if (typeof window.refreshCweGate === "function") window.refreshCweGate();
    if (typeof window.rebuildBq11 === "function") window.rebuildBq11();
    document.querySelectorAll(".opts").forEach((scope) => {
      scope.querySelectorAll(".opt").forEach((opt) => {
        const inp = opt.querySelector("input");
        opt.classList.toggle("sel", Boolean(inp && inp.checked));
      });
    });

    if (typeof draft.__screen === "number") {
      Draft.restoreScreen(draft.__screen);
    } else if (draft._last_screen) {
      Draft.restoreScreen(draft._last_screen);
    }

    const visible = Draft.getVisibleScreen();
    if (visible) startScreenFieldTimers(visible);
  }

  function clearRegistrationDraft(mobile) {
    const id = (mobile || draftIdentity || "").trim();
    if (
      id &&
      window.ConcaveFormDraft &&
      typeof window.ConcaveFormDraft.clear === "function"
    ) {
      window.ConcaveFormDraft.clear("registration", id);
    }
    draftScreenTimes = {};
  }

  function installRegistrationDraft() {
    if (window.__concaveRefillMode) return;

    const Draft = window.ConcaveFormDraft;
    if (!Draft || draftAutosave) return;

    draftAutosave = Draft.attachAutosave({
      formType: "registration",
      getIdentity: function () {
        const mobile =
          document.querySelector("[name=phone]")?.value?.trim() || "";
        if (/^\d{10}$/.test(mobile)) {
          draftIdentity = mobile;
          return mobile;
        }
        return draftIdentity;
      },
      getScreenTimes: function () {
        return mapFieldTimesToAnswerKeys(getLiveScreenTimes());
      },
      shouldSave: function (identity) {
        return /^\d{10}$/.test(String(identity || ""));
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

    const phone = document.querySelector("[name=phone]");
    if (!phone) return;

    let restoreChecked = "";
    async function maybeAutoRestore() {
      const mobile = phone.value.trim();
      if (!/^\d{10}$/.test(mobile) || mobile === restoreChecked) return;
      restoreChecked = mobile;
      draftIdentity = mobile;
      const draft = Draft.load("registration", mobile);
      if (!draft) return;
      // Always resume silently — no confirmation banner.
      applyRegistrationDraft(draft);
    }

    phone.addEventListener("blur", function () {
      void maybeAutoRestore();
    });
    phone.addEventListener("change", function () {
      void maybeAutoRestore();
    });

    // Refresh mid-flow when phone is already filled.
    if (/^\d{10}$/.test(phone.value.trim())) {
      void maybeAutoRestore();
    }
  }

  function installQuestionTiming() {
    if (timingInstalled) return;
    timingInstalled = true;

    document.addEventListener(
      "click",
      (event) => {
        const nextBtn = event.target.closest("[data-next], [data-back]");
        if (!nextBtn) return;
        const visibleScreen = document.querySelector(".screen:not(.hidden)");
        if (visibleScreen) recordScreenFieldTimes(visibleScreen);
      },
      true,
    );

    const observer = new MutationObserver(() => {
      const visibleScreen = document.querySelector(".screen:not(.hidden)");
      if (visibleScreen) startScreenFieldTimers(visibleScreen);
    });

    document.querySelectorAll(".screen").forEach((screen) => {
      observer.observe(screen, {
        attributes: true,
        attributeFilter: ["class"],
      });
    });

    const visibleScreen = document.querySelector(".screen:not(.hidden)");
    if (visibleScreen) startScreenFieldTimers(visibleScreen);
  }

  function buildDobIso() {
    const single = document.querySelector("[name=dob_date]")?.value;
    if (single) return single;

    const month = document.querySelector("[name=dob_month]")?.value;
    const day = document.querySelector("[name=dob_day]")?.value;
    const year = document.querySelector("[name=dob_year]")?.value;
    if (!month || !day || !year) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function collectRawScreenerAnswers() {
    const answers = {};
    const names = new Set();

    document
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach((el) => {
        if (CORE_FIELDS.has(el.name) || el.name.startsWith("dob_")) return;
        names.add(el.name);
      });

    names.forEach((name) => {
      const fields = document.querySelectorAll(
        `input[name="${CSS.escape(name)}"], select[name="${CSS.escape(name)}"], textarea[name="${CSS.escape(name)}"]`,
      );
      if (!fields.length) return;

      const first = fields[0];
      if (first.type === "checkbox") {
        const values = Array.from(fields)
          .filter((field) => field.checked)
          .map((field) => field.value);
        if (values.length) answers[name] = values;
      } else if (first.type === "radio") {
        const checked = Array.from(fields).find((field) => field.checked);
        if (checked) answers[name] = checked.value;
      } else {
        const value = String(first.value ?? "").trim();
        if (value) answers[name] = value;
      }
    });

    return answers;
  }

  function collectAnswersFromFtvPayload() {
    const answers = {};
    try {
      if (typeof window.buildPayload !== "function") return answers;
      const payload = window.buildPayload();
      const rows = payload && Array.isArray(payload.responses) ? payload.responses : [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.qid) continue;
        const value =
          row.answer !== undefined && row.answer !== null && row.answer !== ""
            ? row.answer
            : row.answer_code;
        if (value === undefined || value === null || value === "") continue;
        const key = String(row.qid);
        if (answers[key] === undefined) answers[key] = value;
        else if (Array.isArray(answers[key])) answers[key].push(value);
        else answers[key] = [answers[key], value];
      }
    } catch (error) {
      console.warn("[ConcaveRegistrationBridge] FTV payload answers unavailable:", error);
    }
    return answers;
  }

  function collectScreenerAnswers() {
    const fromPayload = collectAnswersFromFtvPayload();
    const raw = collectRawScreenerAnswers();
    const answers = Object.assign({}, fromPayload);
    for (const [name, value] of Object.entries(raw)) {
      const qKey = fieldToQ(name);
      answers[qKey || name] = value;
    }
    return answers;
  }

  function collectResponseTimes() {
    const answers = collectScreenerAnswers();
    const times = {};
    for (const [name, seconds] of Object.entries(fieldResponseTimes)) {
      const qKey = fieldToQ(name);
      const answerKey = qKey || name;
      if (answers[answerKey] !== undefined) {
        times[answerKey] = seconds;
      }
    }
    for (const key of Object.keys(answers)) {
      if (times[key] === undefined) times[key] = 0;
    }
    return times;
  }

  function resolveResponseTimes(analytics) {
    const Draft = window.ConcaveFormDraft;
    const merge =
      Draft && typeof Draft.mergeTimes === "function"
        ? Draft.mergeTimes
        : function (a, b) {
            return Object.assign({}, a || {}, b || {});
          };

    const mapped = mapAnalyticsResponseTimes(analytics);
    const collected = collectResponseTimes();
    const live = mapFieldTimesToAnswerKeys(getLiveScreenTimes());
    const fromDraft = draftScreenTimes || {};

    // Prefer live/field timers + draft base; fold analytics on top without dropping resume data.
    let merged = merge(fromDraft, collected || {});
    merged = merge(merged, live);
    if (mapped && Object.keys(mapped).length > 0) {
      // Analytics is session-local; add to restored base rather than replace.
      merged = merge(fromDraft, mapped);
      merged = merge(merged, live);
    }
    return Object.keys(merged).length > 0 ? merged : mapped || collected || {};
  }

  function showRegistrationError(message) {
    const existing = document.getElementById("registration-error");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "registration-error";
    banner.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:#FDECEC;color:#8B1E1E;border:1px solid #F5B7B1;border-radius:12px;padding:14px 16px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.12)";
    banner.textContent = message;
    document.body.appendChild(banner);
  }

  const DEFAULT_INSTAGRAM_DM_URL = "https://ig.me/m/concave_insights";
  const DEFAULT_INSTAGRAM_REFERRAL_COMPOSE_URL =
    "https://www.instagram.com/direct/new/";
  const DEFAULT_WHATSAPP_BUSINESS_NUMBER = "919137595485";

  const TEMPLATE_KEYS = {
    INSTAGRAM_VERIFICATION: "instagram_verification",
    WHATSAPP_REFERRAL: "whatsapp_referral",
    INSTAGRAM_REFERRAL: "instagram_referral",
    NOT_ELIGIBLE_REFERRAL: "not_eligible_referral",
    WHATSAPP_SUBMISSION_CONFIRMATION: "whatsapp_submission_confirmation",
  };

  const SUBMISSION_CONFIRMATION_ALIASES = [
    "whatsapp_submission_confirmation",
    "submission_confirmation",
    "submission_confirm",
    "whatsapp_verification",
  ];

  const REFERRAL_REWARD_AMOUNT = 50;

  var registrationMessageCache = null;

  function persistRegistrationResult(registration) {
    registrationMessageCache =
      registration && registration.messages ? registration.messages : null;

    if (!registration || !registration.messages) return;

    try {
      window.sessionStorage.setItem(
        "concave.registrationResult",
        JSON.stringify({
          leadId: registration.leadId || "",
          fullName: registration.fullName || "",
          mobile: registration.mobile || "",
          status: registration.status || "under_review",
          referralLink: registration.referralLink || "",
          messages: registration.messages,
        }),
      );
    } catch (error) {
      // Ignore storage errors in embedded forms.
    }
  }

  function resolveCachedRenderedMessage(templateKey) {
    if (!registrationMessageCache) return null;

    if (templateKey === TEMPLATE_KEYS.INSTAGRAM_VERIFICATION) {
      return registrationMessageCache.instagram_verification || null;
    }
    if (templateKey === TEMPLATE_KEYS.INSTAGRAM_REFERRAL) {
      return registrationMessageCache.instagram_referral || null;
    }
    if (templateKey === TEMPLATE_KEYS.WHATSAPP_REFERRAL) {
      return registrationMessageCache.whatsapp_referral || null;
    }
    if (templateKey === TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL) {
      return registrationMessageCache.not_eligible_referral || null;
    }
    if (templateKey === TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION) {
      return (
        registrationMessageCache.whatsapp_submission_confirmation ||
        registrationMessageCache.submission_confirmation ||
        null
      );
    }

    return null;
  }

  function ensureReferEarnStyles() {
    if (document.getElementById("concave-refer-earn-styles")) return;
    const style = document.createElement("style");
    style.id = "concave-refer-earn-styles";
    style.textContent =
      ".ty-refer-earn{display:flex;flex-direction:column;gap:12px;max-width:460px;margin:24px auto 0;text-align:left}" +
      ".ty-refer-earn-loading{text-align:center;color:#7A6E78;font-size:14px;padding:10px 0}" +
      ".ty-upi-card{background:#F0FFF4;border:1px solid #B8E6C8;border-radius:14px;padding:18px;box-shadow:0 2px 14px rgba(46,139,111,.08)}" +
      ".ty-upi-card h3{margin:0;font-size:15px;font-weight:700;color:#2E8B6F}" +
      ".ty-upi-card p{margin:8px 0 0;font-size:13.5px;line-height:1.45;color:#3E8E7E}" +
      ".ty-upi-card input{width:100%;margin-top:14px;padding:12px 14px;border:1px solid #C9E5DE;border-radius:10px;font-size:15px}" +
      ".ty-upi-card button{width:100%;margin-top:10px;padding:13px;border:none;border-radius:12px;background:#3FA76F;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}" +
      ".ty-upi-card button[data-upi-skip]{margin-top:8px;background:transparent;color:#7A6E78;border:1px solid #C9E5DE;font-weight:600}" +
      ".ty-upi-card button:disabled{opacity:.55;cursor:not-allowed}" +
      ".ty-upi-success{background:#E2F0EC;border:1px solid #C9E5DE;border-radius:14px;padding:18px}" +
      ".ty-upi-success strong{color:#3E8E7E;font-size:14px}" +
      ".ty-upi-success p{margin:8px 0 0;font-size:13.5px;color:#7A6E78}" +
      ".ty-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}" +
      ".ty-stat-tile{background:#fff;border:1px solid #E7D5DD;border-radius:14px;padding:14px 8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.04)}" +
      ".ty-stat-tile .val{font-size:26px;font-weight:700;line-height:1;color:#C2476B;margin-bottom:8px}" +
      ".ty-stat-tile .lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7A6E78}" +
      ".ty-keep-earning{background:#fff;border:1px solid #F0D9E0;border-radius:14px;padding:18px;box-shadow:0 2px 14px rgba(155,47,80,.05)}" +
      ".ty-keep-earning .ke-label{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#C2476B;margin:0}" +
      ".ty-link-box{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border:1px dashed #D4A8BC;border-radius:10px;background:#fff}" +
      ".ty-link-box span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#5C4F58}" +
      ".ty-link-box button{flex:none;border:none;border-radius:8px;background:#FCE8EF;color:#C2476B;font-size:12px;font-weight:600;padding:6px 10px;cursor:pointer;font-family:inherit}" +
      ".ty-share-row{display:flex;gap:8px;margin-top:14px}" +
      ".ty-share-row button{flex:1;border:none;border-radius:12px;padding:12px 8px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:inherit}" +
      ".ty-share-ig{background:linear-gradient(90deg,#C13584,#E1306C,#F77737)}" +
      ".ty-share-wa{background:#3FA76F}" +
      ".ty-cta{display:flex;flex-direction:row;flex-wrap:nowrap;gap:12px;max-width:460px;margin:16px auto 0}" +
      ".ty-cta-share{display:flex;flex-direction:row;flex-wrap:nowrap;gap:12px;width:100%}" +
      ".ty-cta .cta{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:13px 10px;border:none;border-radius:12px;cursor:pointer;font-family:inherit;text-decoration:none;font-weight:700;font-size:14.5px;color:#fff;box-shadow:0 8px 20px -10px rgba(0,0,0,.35)}" +
      ".ty-cta .cta small{font-weight:500;font-size:11.5px;opacity:.92;line-height:1.2;text-align:center}" +
      ".ty-cta .cta-ig{background:linear-gradient(90deg,#C13584,#E1306C,#F77737)}" +
      ".ty-cta .cta-wa{background:#3FA76F}" +
      ".ty-cta .cta-ref{background:#C2476B}" +
      ".ty-hero{text-align:center;max-width:460px;margin:0 auto}" +
      ".ty-check-icon{width:84px;height:84px;margin:0 auto 16px;border-radius:999px;background:#E3F0EC;display:grid;place-items:center}" +
      ".ty-check-icon svg{width:40px;height:40px;stroke:#2E8B6F;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}" +
      ".ty-hero h1{margin:0;font-size:23px;line-height:1.25;font-weight:700;color:#2B2230}" +
      ".ty-hero .ty-emoji{margin-top:8px;font-size:20px;line-height:1}" +
      ".ty-hero .ty-intro{margin:12px 0 0;font-size:15px;line-height:1.5;color:#7A6E78}" +
      ".ty-steps-card{margin-top:20px;border:1px solid #F7E6EC;border-radius:16px;background:#fff;padding:22px 22px 8px;text-align:left;box-shadow:0 10px 30px -22px rgba(156,47,80,.35)}" +
      ".ty-step{padding-bottom:16px}" +
      ".ty-step:last-child{padding-bottom:8px}" +
      ".ty-step-title{margin:0;font-size:15.5px;line-height:1.35;font-weight:700;color:#2B2230}" +
      ".ty-step-title .ty-step-num{color:#C2476B}" +
      ".ty-step-desc{margin:4px 0 0;font-size:13.5px;line-height:1.45;color:#7A6E78}" +
      ".ty-channel-note{max-width:460px;margin:24px auto 0;text-align:center;font-size:12.5px;line-height:1.45;color:#9A8F98}" +
      "#instagram-dm-guide-overlay{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px}" +
      "#instagram-dm-guide-panel{width:100%;max-width:22rem;border-radius:14px;border:1px solid #E7E2EA;background:#fff;box-shadow:0 16px 40px rgba(0,0,0,.18);padding:20px}" +
      "#instagram-dm-guide-panel .ig-title{margin:0;font-size:16px;font-weight:600;line-height:1.35;color:#2B2230}" +
      "#instagram-dm-guide-panel .ig-desc{margin:8px 0 0;font-size:14px;line-height:1.45;color:#7A6E78}" +
      "#instagram-dm-guide-panel .ig-steps{margin:16px 0 0;padding:0;list-style:none}" +
      "#instagram-dm-guide-panel .ig-step{display:flex;gap:10px;margin-bottom:10px;font-size:14px;line-height:1.35;color:#2B2230}" +
      "#instagram-dm-guide-panel .ig-step-num{flex:none;width:20px;height:20px;border-radius:999px;background:rgba(194,71,107,.12);color:#C2476B;font-size:11px;font-weight:700;display:grid;place-items:center}" +
      "#instagram-dm-guide-panel .ig-instructions{margin:12px 0 0;padding-left:18px;font-size:14px;font-weight:600;line-height:1.45;color:#2B2230}" +
      "#instagram-dm-guide-panel .ig-instructions li{margin-bottom:8px}" +
      "#instagram-dm-guide-panel .ig-copy-status{margin:12px 0 0;font-size:12px;font-weight:600;line-height:1.4;color:#2E8B6F}" +
      "#instagram-dm-guide-panel .ig-copy-hint button{border:none;background:none;padding:0;font:inherit;font-weight:600;color:#C2476B;text-decoration:underline;cursor:pointer}" +
      "#instagram-dm-guide-panel .ig-actions{display:flex;flex-direction:column;gap:8px;margin-top:16px}" +
      "#instagram-dm-guide-panel .ig-btn{border:none;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;width:100%}" +
      "#instagram-dm-guide-panel .ig-btn-cancel{background:transparent;color:#7A6E78}" +
      "#instagram-dm-guide-panel .ig-btn-open{background:#C2476B;color:#fff}" +
      "#instagram-dm-guide-panel .ig-message-box{margin-top:16px;border:1px solid #E7E2EA;border-radius:10px;background:#F8F6F9;padding:12px}" +
      "#instagram-dm-guide-panel .ig-message-label{margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#7A6E78}" +
      "#instagram-dm-guide-panel .ig-message-text{margin:0;max-height:12rem;overflow:auto;white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.45;color:#2B2230}" +
      "#instagram-dm-guide-panel .ig-btn-copy{background:#fff;color:#2B2230;border:1px solid #E7E2EA}" +
      "#instagram-dm-guide-panel .ig-btn-continue{background:#C2476B;color:#fff}" +
      "#referral-invite-overlay{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px}" +
      "#referral-invite-panel{width:100%;max-width:22rem;border-radius:14px;border:1px solid #E7E2EA;background:#fff;box-shadow:0 16px 40px rgba(0,0,0,.18);padding:20px}" +
      "#referral-invite-panel .ri-title{margin:0;font-size:16px;font-weight:600;line-height:1.35;color:#2B2230}" +
      "#referral-invite-panel .ri-desc{margin:8px 0 0;font-size:14px;font-weight:600;line-height:1.45;color:#2B2230}" +
      "#referral-invite-panel .ri-actions{display:flex;flex-direction:column;gap:8px;margin-top:16px}" +
      "#referral-invite-panel .ri-btn{border:none;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;width:100%}" +
      "#referral-invite-panel .ri-btn-ig{background:linear-gradient(90deg,#C13584,#E1306C,#F77737);color:#fff}" +
      "#referral-invite-panel .ri-btn-wa{background:#3FA76F;color:#fff}" +
      "#referral-invite-panel .ri-btn-cancel{background:transparent;color:#7A6E78}" +
      "#consent-refer-earn-overlay{position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px}" +
      "#consent-refer-earn-panel{width:100%;max-width:22rem;border-radius:14px;border:1px solid #E7E2EA;background:#fff;box-shadow:0 16px 40px rgba(0,0,0,.18);padding:20px}" +
      "#consent-refer-earn-panel .cre-title{margin:0;font-size:18px;font-weight:700;line-height:1.35;color:#2B2230}" +
      "#consent-refer-earn-panel .cre-subtitle{margin:10px 0 0;font-size:14px;font-weight:600;line-height:1.45;color:#2B2230}" +
      "#consent-refer-earn-panel .cre-desc{margin:8px 0 0;font-size:14px;line-height:1.5;color:#7A6E78}" +
      "#consent-refer-earn-panel .cre-actions{display:flex;flex-direction:row;gap:12px;margin-top:18px}" +
      "#consent-refer-earn-panel .cre-btn{border:none;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;flex:1;min-width:0}" +
      "#consent-refer-earn-panel .cre-btn-yes{background:#C2476B;color:#fff}" +
      "#consent-refer-earn-panel .cre-btn-no{background:transparent;color:#7A6E78;border:1px solid #E7E2EA}" +
      "#referral-lead-capture-overlay{position:fixed;inset:0;z-index:10003;overflow:auto;background:#F8F6F9;padding:16px}" +
      "#referral-lead-capture-panel{width:100%;max-width:28rem;margin:0 auto;border-radius:14px;border:1px solid #E7E2EA;background:#fff;box-shadow:0 16px 40px rgba(0,0,0,.12);padding:20px}" +
      "#referral-lead-capture-panel .rl-title{margin:0;font-size:20px;font-weight:700;line-height:1.35;color:#2B2230}" +
      "#referral-lead-capture-panel .rl-subtitle{margin:8px 0 0;font-size:14px;line-height:1.45;color:#7A6E78}" +
      "#referral-lead-capture-panel .rl-field{margin-top:14px}" +
      "#referral-lead-capture-panel .rl-label{display:block;margin-bottom:6px;font-size:14px;font-weight:600;color:#2B2230}" +
      "#referral-lead-capture-panel .rl-input{width:100%;padding:12px 14px;border:1px solid #E7E2EA;border-radius:10px;font-size:15px;font-family:inherit}" +
      "#referral-lead-capture-panel .rl-input.rl-invalid{border-color:#D14343}" +
      "#referral-lead-capture-panel .rl-error{margin:6px 0 0;font-size:12px;line-height:1.35;color:#D14343;display:none}" +
      "#referral-lead-capture-panel .rl-error.rl-show{display:block}" +
      "#referral-lead-capture-panel .rl-actions{display:flex;flex-direction:column;gap:8px;margin-top:18px}" +
      "#referral-lead-capture-panel .rl-btn{border:none;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;width:100%}" +
      "#referral-lead-capture-panel .rl-btn-submit{background:#C2476B;color:#fff}" +
      "#referral-lead-capture-panel .rl-btn-submit:disabled{opacity:.6;cursor:not-allowed}" +
      "#referral-lead-capture-panel .rl-btn-cancel{background:transparent;color:#7A6E78;border:1px solid #E7E2EA}" +
      "#referral-lead-capture-panel .rl-banner{margin-top:12px;padding:10px 12px;border-radius:10px;background:#FCE8EF;color:#9C2F50;font-size:13px;line-height:1.4}" +
      "#s-referral-lead-complete .center{text-align:center;padding:10px 4px 4px}" +
      "#s-referral-lead-complete .big{font-family:Georgia,serif;font-size:26px;color:#9C2F50;margin-bottom:12px}" +
      "#s-referral-lead-complete p{color:#7A6E78;font-size:15px;margin:0 0 10px;line-height:1.5}" +
      "#s-referral-lead-complete .rl-preparing{margin:16px 0 0;padding:10px 0;text-align:center;color:#7A6E78;font-size:14px}" +
      "#s-referral-lead-complete .rl-preparing.hidden,#s-referral-lead-complete .rl-cta-row.hidden{display:none}" +
      "#s-referral-lead-complete .rl-cta-row{display:flex;flex-direction:row;gap:12px;max-width:460px;margin:16px auto 0;padding:0 10px}" +
      "#s-referral-lead-complete .rl-cta{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:13px 10px;border:none;border-radius:12px;cursor:pointer;font-family:inherit;font-weight:700;font-size:14.5px;color:#fff;box-shadow:0 8px 20px -10px rgba(0,0,0,.35)}" +
      "#s-referral-lead-complete .rl-cta small{font-weight:500;font-size:11.5px;opacity:.92;line-height:1.2;text-align:center}" +
      "#s-referral-lead-complete .rl-cta-wa{background:#3FA76F}" +
      "#s-referral-lead-complete .rl-cta-share{background:#C2476B}" +
      "#s-consent-polite .center{text-align:center;padding:10px 4px 4px}" +
      "#s-consent-polite .big{font-family:Georgia,serif;font-size:26px;color:#9C2F50;margin-bottom:12px}" +
      "#s-consent-polite p{color:#7A6E78;font-size:15px;margin:0 0 10px;line-height:1.5}" +
      "#s-consent-polite .rl-preparing{margin:16px 0 0;padding:10px 0;text-align:center;color:#7A6E78;font-size:14px}" +
      "#referral-invite-panel .ri-btn-copy{background:#fff;color:#2B2230;border:1px solid #E7E2EA}" +
      "#instagram-dm-guide-panel .ig-copy-hint{margin:12px 0 0;font-size:12px;font-weight:600;line-height:1.4;color:#7A6E78}" +
      ".concave-result-message .big{font-family:Georgia,serif;font-size:26px;color:#9C2F50;margin-bottom:12px;text-align:center}" +
      ".concave-result-message p{color:#7A6E78;font-size:15px;margin-bottom:12px;text-align:center;line-height:1.5}";
    document.head.appendChild(style);
  }

  const CONCAVE_ATTR = {
    result: "data-concave-result",
    host: "data-concave-result-host",
    message: "data-concave-result-message",
    qualifiedOnly: "data-concave-qualified-only",
    cta: "data-concave-cta",
    referEarn: "data-concave-refer-earn",
  };

  const LEGACY_RESULT_SCREEN_IDS = [
    "s-thankyou",
    "s-terminate",
    "s-terminate-male",
  ];

  const TERMINATION_COPY = {
    consent: {
      title: "Thank you for your time!",
      body: [
        "We completely respect your decision. This study isn't a fit right now, but we truly appreciate you stopping by.",
        "You're welcome to participate in our future research whenever you'd like. You can also share with friends or family who may be interested in this study.",
      ],
    },
    "gender-male": {
      title: "Thank you for your interest!",
      body: [
        "This particular study is open only to women, so it isn't a fit for you right now — but we truly appreciate you stopping by.",
        "You can still refer a woman who fits the study and share with your friends and family.",
        "We'd also love to have you in our future research. 🌸",
      ],
    },
    "TERMINATE_AGE_OUT_OF_RANGE": {
      title: "Thank you for your interest!",
      body: [
        "This study is limited to a specific age group, so it isn't a fit for you right now — but we truly appreciate you stopping by.",
        "You can still refer friends or family who may be eligible and share the study with them.",
      ],
    },
    default: {
      title: "Thank you for your interest!",
      body: [
        "This study isn't a fit for you right now — but we truly appreciate you stopping by.",
        "You can still share with friends and family who may be interested in this study.",
      ],
    },
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getVisibleScreen() {
    return document.querySelector(".screen:not(.hidden)");
  }

  function getResultScreenById(screenId) {
    if (!screenId) return getVisibleScreen();
    return document.getElementById(screenId);
  }

  function isResultScreen(screenId) {
    const screen = getResultScreenById(screenId);
    if (!screen) return false;
    if (screen.hasAttribute(CONCAVE_ATTR.result)) return true;
    if (LEGACY_RESULT_SCREEN_IDS.indexOf(screenId) >= 0) return true;
    if (screen.querySelector("[" + CONCAVE_ATTR.host + "]")) return true;
    return false;
  }

  function findAllResultScreens() {
    const screens = [];
    const seen = new Set();

    document
      .querySelectorAll("[" + CONCAVE_ATTR.result + "]")
      .forEach(function (el) {
        if (!seen.has(el)) {
          seen.add(el);
          screens.push(el);
        }
      });

    LEGACY_RESULT_SCREEN_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el && !seen.has(el)) {
        seen.add(el);
        screens.push(el);
      }
    });

    return screens;
  }

  function getResultHost(screen) {
    if (!screen) return null;
    return (
      screen.querySelector("[" + CONCAVE_ATTR.host + "]") ||
      screen.querySelector(".center") ||
      screen
    );
  }

  function ensureMountPoint(host, attr, tagName, className, innerHtml) {
    let node = host.querySelector("[" + attr + "]");
    if (!node) {
      node = document.createElement(tagName);
      node.setAttribute(attr, "");
      if (className) node.className = className;
      if (innerHtml) node.innerHTML = innerHtml;
      host.appendChild(node);
    }
    if (attr === CONCAVE_ATTR.cta && !node.id) {
      node.id = "ty-cta";
    }
    return node;
  }

  function ensureResultMountPoints(host) {
    ensureMountPoint(
      host,
      CONCAVE_ATTR.message,
      "div",
      "concave-result-message hidden",
    );
    ensureMountPoint(host, CONCAVE_ATTR.cta, "div", "ty-cta hidden");
    ensureMountPoint(
      host,
      CONCAVE_ATTR.referEarn,
      "div",
      "ty-refer-earn hidden",
    );
  }

  function ensureResultInfrastructure() {
    findAllResultScreens().forEach(function (screen) {
      const host = getResultHost(screen);
      if (host) ensureResultMountPoints(host);
    });
  }

  function resolveTerminationCopy() {
    const reasons = window.__termReasons || [];
    if (reasons.indexOf("consent") >= 0) return TERMINATION_COPY.consent;
    if (reasons.indexOf("gender-male") >= 0)
      return TERMINATION_COPY["gender-male"];
    if (reasons.indexOf("TERMINATE_AGE_OUT_OF_RANGE") >= 0) {
      return TERMINATION_COPY.TERMINATE_AGE_OUT_OF_RANGE;
    }
    return TERMINATION_COPY.default;
  }

  function hideLegacyTerminateCopy(host) {
    Array.from(host.children).forEach(function (child) {
      if (child.hasAttribute(CONCAVE_ATTR.message)) return;
      if (child.hasAttribute(CONCAVE_ATTR.cta)) return;
      if (child.hasAttribute(CONCAVE_ATTR.referEarn)) return;
      if (child.hasAttribute(CONCAVE_ATTR.qualifiedOnly)) return;
      child.classList.add("hidden");
    });
  }

  function restoreLegacyResultCopy(host) {
    const messageSlot = host.querySelector("[" + CONCAVE_ATTR.message + "]");
    if (messageSlot) {
      messageSlot.classList.add("hidden");
      messageSlot.innerHTML = "";
    }

    Array.from(host.children).forEach(function (child) {
      if (child.hasAttribute(CONCAVE_ATTR.message)) return;
      if (child.hasAttribute(CONCAVE_ATTR.cta)) return;
      if (child.hasAttribute(CONCAVE_ATTR.referEarn)) return;
      if (child.hasAttribute("data-concave-channel-note")) return;
      child.classList.remove("hidden");
    });
  }

  function isTerminateScreen(screen) {
    if (!screen || !screen.id) return false;
    return (
      screen.id === "s-terminate" ||
      screen.id === "s-terminate-male" ||
      screen.id.indexOf("terminate") >= 0
    );
  }

  function syncTerminationState() {
    const screen = getVisibleScreen();
    if (isTerminateScreen(screen)) {
      window.__terminated = true;
    }

    if (typeof window.__concaveCollectTerminations === "function") {
      window.__termReasons = window.__concaveCollectTerminations();
      if (window.__termReasons && window.__termReasons.length) {
        window.__terminated = true;
      }
      return;
    }

    var reasons = Array.isArray(window.__termReasons)
      ? window.__termReasons.slice()
      : [];
    var gender = document.querySelector('input[name="gender"]:checked');
    if (
      gender &&
      gender.value === "Male" &&
      reasons.indexOf("gender-male") < 0
    ) {
      reasons.push("gender-male");
    }
    var consent = document.querySelector('input[name="consent"]:checked');
    if (consent && consent.value === "No" && reasons.indexOf("consent") < 0) {
      reasons.push("consent");
    }
    if (reasons.length) {
      window.__termReasons = reasons;
      window.__terminated = true;
    }
  }

  function renderTerminationMessage(host) {
    const copy = resolveTerminationCopy();
    const slot = ensureMountPoint(
      host,
      CONCAVE_ATTR.message,
      "div",
      "concave-result-message",
    );

    slot.innerHTML =
      '<div class="big">' +
      escapeHtml(copy.title) +
      "</div>" +
      copy.body
        .map(function (paragraph) {
          return "<p>" + escapeHtml(paragraph) + "</p>";
        })
        .join("");
    slot.classList.remove("hidden");

    const qualifiedBlocks = host.querySelectorAll(
      "[" + CONCAVE_ATTR.qualifiedOnly + "]",
    );
    if (qualifiedBlocks.length > 0) {
      qualifiedBlocks.forEach(function (el) {
        el.classList.add("hidden");
      });
      return;
    }

    hideLegacyTerminateCopy(host);
  }

  function applyTerminatedResultPresentation(screen) {
    if (!screen) return;
    const host = getResultHost(screen);
    if (!host) return;
    ensureResultMountPoints(host);
    renderTerminationMessage(host);

    const cta = host.querySelector("[" + CONCAVE_ATTR.cta + "]");
    if (cta) cta.classList.add("hidden");
  }

  function getPanelContainer(attr, legacySelector, screen) {
    const host = getResultHost(screen || getVisibleScreen());
    if (host) {
      const scoped = host.querySelector("[" + attr + "]");
      if (scoped) return scoped;
    }
    if (legacySelector) {
      const legacy = document.querySelector(legacySelector);
      if (legacy) return legacy;
    }
    return document.querySelector("[" + attr + "]");
  }

  function getReferEarnContainer(screen) {
    return getPanelContainer(CONCAVE_ATTR.referEarn, ".ty-refer-earn", screen);
  }

  function getCtaContainer(screen) {
    const host = getResultHost(screen || getVisibleScreen());
    if (host) {
      const scoped =
        host.querySelector("[" + CONCAVE_ATTR.cta + "]") ||
        host.querySelector("#ty-cta");
      if (scoped) return scoped;
    }
    return document.getElementById("ty-cta");
  }

  function formatInr(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN");
  }

  function resolveDisplayAmount(totalEarned, qualifiedCount) {
    if (totalEarned > 0) return totalEarned;
    if (qualifiedCount > 0) return qualifiedCount * REFERRAL_REWARD_AMOUNT;
    return 0;
  }

  function referralCodeFromLink(link) {
    if (!link) return "";
    try {
      const segments = new URL(link, window.location.origin).pathname
        .split("/")
        .filter(Boolean);
      const code = segments[segments.length - 1] || "";
      return code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    } catch (error) {
      const match = String(link).match(/\/r\/(?:[wic]\/)?([^/?#]+)/i);
      return match && match[1] ? match[1].toUpperCase() : "";
    }
  }

  function buildTrackedReferralLink(referralLink, platform) {
    const code = referralCodeFromLink(referralLink);
    if (!code) return referralLink;
    const origin = new URL(referralLink, window.location.origin).origin;
    const segment =
      platform === "whatsapp" ? "w" : platform === "instagram" ? "i" : "c";
    return origin + "/r/" + segment + "/" + encodeURIComponent(code);
  }

  function displayReferralLink(link) {
    if (!link) return "";
    try {
      const url = new URL(link, window.location.origin);
      return url.host + url.pathname + url.search;
    } catch (error) {
      return String(link).replace(/^https?:\/\//i, "");
    }
  }

  async function fetchParticipantProfile() {
    const response = await fetch("/api/participant/me", {
      credentials: "include",
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load participant profile.");
    }
    return payload;
  }

  async function saveParticipantUpi(upiId) {
    const response = await fetch("/api/participant/upi", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upiId: upiId }),
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      const error = new Error(payload.error || "Failed to save UPI ID.");
      error.code = payload.code;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function renderUpiSuccessCard() {
    return (
      '<div class="ty-upi-success">' +
      "<strong>✅ UPI Added Successfully</strong>" +
      "<p>We'll process your payment shortly.</p>" +
      "</div>"
    );
  }

  function renderSurveyUpiPromptCard(upiId) {
    if (upiId && String(upiId).trim()) return renderUpiSuccessCard();

    return (
      '<div class="ty-upi-card" data-upi-card="1">' +
      "<h3>💳 Add your UPI ID</h3>" +
      "<p>We'll send your survey incentive via UPI after your response is verified. You can skip and add it later from your dashboard.</p>" +
      '<input type="text" placeholder="yourname@upi" aria-label="UPI ID" data-upi-input />' +
      '<button type="button" data-upi-submit>Save UPI ID</button>' +
      '<button type="button" data-upi-skip>Skip for now</button>' +
      "</div>"
    );
  }

  function renderUpiPromptCard(stats, upiId) {
    if (upiId && String(upiId).trim()) return renderUpiSuccessCard();

    const displayAmount = resolveDisplayAmount(
      stats.totalEarned,
      stats.qualifiedCount,
    );
    if (displayAmount <= 0) return "";

    const friendLabel = stats.qualifiedCount === 1 ? "friend" : "friends";
    return (
      '<div class="ty-upi-card" data-upi-card="1">' +
      "<h3>💸 " +
      formatInr(displayAmount) +
      " reward available</h3>" +
      "<p>" +
      stats.qualifiedCount +
      " " +
      friendLabel +
      " you referred qualified. Add your UPI and we'll send your reward via Razorpay.</p>" +
      '<input type="text" placeholder="yourname@upi" aria-label="UPI ID" data-upi-input />' +
      '<button type="button" data-upi-submit>Add UPI &amp; get paid</button>' +
      "</div>"
    );
  }

  function renderStatsRow(stats) {
    return (
      '<div class="ty-stats-row">' +
      '<div class="ty-stat-tile"><div class="val">' +
      (stats.referredCount || 0) +
      '</div><div class="lbl">Referred</div></div>' +
      '<div class="ty-stat-tile"><div class="val">' +
      (stats.qualifiedCount || 0) +
      '</div><div class="lbl">Qualified</div></div>' +
      '<div class="ty-stat-tile"><div class="val">' +
      formatInr(stats.totalEarned || 0) +
      '</div><div class="lbl">Rewards</div></div>' +
      "</div>"
    );
  }

  function renderKeepEarningCard(referralLink) {
    const displayLink = displayReferralLink(referralLink);
    return (
      '<div class="ty-keep-earning">' +
      '<p class="ke-label">Share with friends</p>' +
      '<div class="ty-link-box">' +
      "<span>" +
      (displayLink || "Your referral link will appear here") +
      "</span>" +
      '<button type="button" data-copy-link' +
      (referralLink ? "" : " disabled") +
      ">Copy</button>" +
      "</div>" +
      '<div class="ty-share-row">' +
      '<button type="button" class="ty-share-ig" data-share-instagram' +
      (referralLink ? "" : " disabled") +
      ">Share on Instagram</button>" +
      '<button type="button" class="ty-share-wa" data-share-whatsapp' +
      (referralLink ? "" : " disabled") +
      ">Share on WhatsApp</button>" +
      "</div>" +
      "</div>"
    );
  }

  function bindReferEarnPanel(container, profile) {
    const referralLink = profile.referralLink || "";
    const stats = profile.referralStats || {
      referredCount: 0,
      qualifiedCount: 0,
      totalEarned: 0,
    };

    const copyButton = container.querySelector("[data-copy-link]");
    if (copyButton) {
      copyButton.addEventListener("click", function () {
        if (!referralLink) return;
        void navigator.clipboard
          .writeText(buildTrackedReferralLink(referralLink, "copy"))
          .then(function () {
            showCopiedToast("Referral link copied.");
          })
          .catch(function () {
            showCopiedToast("Could not copy the referral link.");
          });
      });
    }

    const instagramButton = container.querySelector("[data-share-instagram]");
    if (instagramButton) {
      instagramButton.addEventListener("click", function () {
        if (!referralLink) return;
        void fetchRenderedParticipantMessage(
          TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
          "instagram",
        )
          .then(function (rendered) {
            shareOnInstagram(rendered.message, rendered.instagramDmUrl);
          })
          .catch(function (error) {
            console.error("Failed to open Instagram share:", error);
            showCopiedToast("Could not prepare your share message.");
          });
      });
    }

    const whatsappButton = container.querySelector("[data-share-whatsapp]");
    if (whatsappButton) {
      whatsappButton.addEventListener("click", function () {
        if (!referralLink) return;
        void fetchRenderedParticipantMessage(
          TEMPLATE_KEYS.WHATSAPP_REFERRAL,
          "whatsapp",
        )
          .then(function (rendered) {
            window.open(
              buildWhatsAppShareUrl(rendered.message),
              "_blank",
              "noopener,noreferrer",
            );
          })
          .catch(function (error) {
            console.error("Failed to open WhatsApp share:", error);
            showCopiedToast("Could not prepare your share message.");
          });
      });
    }

    const upiSubmit = container.querySelector("[data-upi-submit]");
    const upiInput = container.querySelector("[data-upi-input]");
    if (upiSubmit && upiInput) {
      upiSubmit.addEventListener("click", function () {
        const value = String(upiInput.value || "").trim();
        if (!value) return;

        upiSubmit.disabled = true;
        void saveParticipantUpi(value)
          .then(function (payload) {
            profile.upiId = payload.upiId || value;
            const upiCard = container.querySelector("[data-upi-card]");
            if (upiCard) {
              upiCard.outerHTML = renderUpiSuccessCard();
            }
            showCopiedToast("UPI ID saved.");
          })
          .catch(function (error) {
            upiSubmit.disabled = false;
            console.error("[ConcaveRegistrationBridge] UPI save failed:", error);
            if (error && error.code === "INVALID_UPI") {
              showCopiedToast("Please enter a valid UPI ID (e.g. name@bank).");
              return;
            }
            if (
              error &&
              (error.status === 401 || error.code === "SESSION_EXPIRED")
            ) {
              showCopiedToast(
                "Please log in to save your UPI ID.",
                "Use the login link if you already registered.",
              );
              return;
            }
            showCopiedToast(
              (error && error.message) || "Could not save your UPI ID.",
            );
          });
      });
    }

    const upiSkip = container.querySelector("[data-upi-skip]");
    if (upiSkip) {
      upiSkip.addEventListener("click", function () {
        const upiCard = container.querySelector("[data-upi-card]");
        if (upiCard) upiCard.remove();
      });
    }
  }

  function renderReferEarnPanel(profile, options) {
    const stats = profile.referralStats || {
      referredCount: 0,
      qualifiedCount: 0,
      totalEarned: 0,
    };
    const referralLink = profile.referralLink || "";
    const upiId = profile.upiId || null;
    const terminated = options && options.terminated;

    const upiBlock = terminated
      ? renderUpiPromptCard(stats, upiId)
      : renderSurveyUpiPromptCard(upiId);

    return (
      upiBlock +
      renderStatsRow(stats) +
      renderKeepEarningCard(referralLink)
    );
  }

  async function mountPostSurveyReferEarnPanel(registration) {
    const screen = getVisibleScreen();
    const container = getReferEarnContainer(screen);
    if (!container) return;

    const cta = getCtaContainer(screen);
    if (cta) cta.classList.add("hidden");

    container.setAttribute("aria-live", "polite");
    container.classList.remove("hidden");
    container.innerHTML =
      '<p class="ty-refer-earn-loading"><strong>Preparing your referral options…</strong></p>';

    let profile = {
      referralLink: registration.referralLink || "",
      upiId: null,
      referralStats: {
        referredCount: 0,
        qualifiedCount: 0,
        totalEarned: 0,
      },
    };

    try {
      const fetched = await fetchParticipantProfile();
      profile = {
        referralLink: fetched.referralLink || profile.referralLink,
        upiId: fetched.upiId || null,
        referralStats: fetched.referralStats || profile.referralStats,
      };
    } catch (error) {
      console.warn("Could not refresh participant profile:", error);
    }

    container.innerHTML = renderReferEarnPanel(profile, {
      terminated: isTerminatedRegistrationStatus(registration.status),
    });
    bindReferEarnPanel(container, profile);
  }

  async function mountTerminatedReferEarnPanel(registration) {
    return mountPostSurveyReferEarnPanel(registration);
  }

  function renderMessageTemplate(template, context) {
    return String(template || "").replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      function (_, key) {
        return context[key] !== undefined && context[key] !== null
          ? String(context[key])
          : "";
      },
    );
  }

  function buildInstagramShareUrl(dmUrl, message) {
    return dmUrl + "?text=" + encodeURIComponent(message);
  }

  /**
   * Open Instagram in exactly one new tab.
   * Do not use window.open + location.assign: with "noopener", window.open often
   * returns null even when a tab opened, and location.assign then turns the
   * current tab into a second Instagram tab.
   */
  function openInstagramUrlOnce(url) {
    if (!url) return;
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function openInstagramDmTab(message, dmUrl) {
    openInstagramUrlOnce(buildInstagramShareUrl(dmUrl, message));
  }

  function openInstagramInbox(dmUrl) {
    openInstagramUrlOnce(dmUrl || DEFAULT_INSTAGRAM_DM_URL);
  }

  function openInstagramReferralComposer() {
    openInstagramUrlOnce(DEFAULT_INSTAGRAM_REFERRAL_COMPOSE_URL);
  }

  function copyInstagramMessage(message) {
    return navigator.clipboard
      .writeText(message)
      .then(function () {
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function closeInstagramDmGuideModal() {
    const existing = document.getElementById("instagram-dm-guide-overlay");
    if (existing) existing.remove();
  }

  function closeReferralInviteModal() {
    const existing = document.getElementById("referral-invite-overlay");
    if (existing) existing.remove();
  }

  function trackConcaveEvent(name, detail) {
    try {
      if (
        window.SurveyAnalytics &&
        typeof window.SurveyAnalytics.track === "function"
      ) {
        window.SurveyAnalytics.track(name, detail || {});
      }
    } catch (error) {
      // Analytics must never block the form.
    }
    if (typeof console !== "undefined" && console.info) {
      console.info("[ConcaveAnalytics]", name, detail || "");
    }
  }

  function isConsentScreenVisible() {
    const screen = document.getElementById("s-consent");
    return Boolean(screen && !screen.classList.contains("hidden"));
  }

  function resolveContactScreenId() {
    if (document.getElementById("s-demo")) return "s-demo";
    if (document.getElementById("s-basic")) return "s-basic";

    const screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) {
      var screen = screens[i];
      if (
        screen.querySelector('[name="name"]') &&
        screen.querySelector('[name="phone"]')
      ) {
        return screen.id;
      }
    }

    return "s-demo";
  }

  function isContactScreenVisible() {
    const screenId = resolveContactScreenId();
    const screen = document.getElementById(screenId);
    return Boolean(screen && !screen.classList.contains("hidden"));
  }

  function isDemoScreenVisible() {
    return isContactScreenVisible();
  }

  function isConsentNoSelected() {
    const consent = document.querySelector('input[name="consent"]:checked');
    return Boolean(consent && consent.value === "No");
  }

  function consentScreenHasSelection() {
    return Boolean(document.querySelector('input[name="consent"]:checked'));
  }

  function readAgeBand() {
    const checked = document.querySelector('input[name="age_band"]:checked');
    if (checked && checked.value) {
      return coerceAgeBandValue(String(checked.value).trim());
    }
    const named = document.querySelector("[name=age_band]");
    const namedValue = coerceAgeBandValue(named?.value?.trim() || "");
    if (namedValue) return namedValue;
    try {
      if (typeof window.buildPayload === "function") {
        const payload = window.buildPayload();
        const profile = payload && payload.profile ? payload.profile : null;
        if (profile) {
          const fromToday = coerceAgeBandValue(
            String(profile.age_band || profile.age_today || ""),
          );
          if (fromToday) return fromToday;
          const fromDob = ageBandFromDob(profile.dob || "");
          if (fromDob) return fromDob;
        }
      }
    } catch (_error) {
      /* fall through */
    }
    const dob =
      document.querySelector("[name=dob_date]")?.value?.trim() || "";
    return ageBandFromDob(dob);
  }

  function formatAgeYears(n) {
    const v = Math.round(Number(n) * 100) / 100;
    return Number.isFinite(v) && v >= 1 ? String(v) : "";
  }

  function coerceAgeBandValue(raw) {
    const value = String(raw || "").trim();
    if (/^(18|19|20|21|22|23\+)$/.test(value)) return value;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 120) {
      return formatAgeYears(numeric);
    }
    return "";
  }

  function ageBandFromDob(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const parts = iso.split("-").map(Number);
    const birth = new Date(parts[0], parts[1] - 1, parts[2]);
    if (Number.isNaN(birth.getTime())) return "";
    const age = (Date.now() - birth.getTime()) / 31557600000;
    return formatAgeYears(age);
  }

  function demoContactFieldsValid() {
    const city = document.querySelector("[name=city]")?.value?.trim() || "";
    const ageBand = readAgeBand();
    return Boolean(city && ageBand);
  }

  function showScreenById(screenId) {
    const targetId = screenId || resolveContactScreenId();
    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.classList.add("hidden");
    });
    const target = document.getElementById(targetId);
    if (!target) {
      console.warn(
        "[ConcaveRegistrationBridge] contact screen not found:",
        targetId,
      );
      return;
    }
    target.classList.remove("hidden");
    const bar = document.getElementById("bar");
    if (bar) {
      bar.style.width = "15%";
    }
    window.scrollTo(0, 0);
    startScreenFieldTimers(target);
  }

  function closeReferralLeadCaptureForm() {
    const existing = document.getElementById("referral-lead-capture-overlay");
    if (existing) existing.remove();
  }

  function normalizeReferralLeadMobile(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatIsoDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function getTodayIso() {
    return formatIsoDateLocal(new Date());
  }

  function getLatestAdultDobIso() {
    const today = new Date();
    return formatIsoDateLocal(
      new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()),
    );
  }

  function getMaxSelectableDobIso() {
    const today = getTodayIso();
    const adultMax = getLatestAdultDobIso();
    return today < adultMax ? today : adultMax;
  }

  function getEarliestDobIso() {
    return String(new Date().getFullYear() - 100) + "-01-01";
  }

  function isCompleteIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
  }

  function applyDobValidity(input) {
    if (!input) return;
    if (!input.value) {
      input.setCustomValidity("");
      return;
    }
    if (!isCompleteIsoDate(input.value)) {
      input.setCustomValidity("");
      return;
    }
    const error = validateDobValue(input.value);
    input.setCustomValidity(error || "");
  }

  /**
   * Do NOT rewrite the field to min/max while typing.
   * Chrome clamps incomplete years against `min` (e.g. typing 2004 → snaps to 1926).
   * Keep max for the calendar picker; apply min only when the picker is opened via
   * a non-typing interaction is unreliable, so we omit min and validate on blur/submit.
   */
  function configureDobDateInput(input) {
    if (!input) return;

    // Adult max only — never set min on the element (browser typing bug).
    input.max = getMaxSelectableDobIso();
    input.removeAttribute("min");

    if (input.dataset.dobConstraintsBound === "1") {
      applyDobValidity(input);
      return;
    }
    input.dataset.dobConstraintsBound = "1";

    input.addEventListener("focus", function () {
      input.max = getMaxSelectableDobIso();
      input.removeAttribute("min");
    });

    input.addEventListener("change", function () {
      applyDobValidity(input);
    });

    input.addEventListener("blur", function () {
      applyDobValidity(input);
    });

    applyDobValidity(input);
  }

  function isFutureDob(dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
    const parts = dob.split("-");
    const birth = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );
    if (Number.isNaN(birth.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    birth.setHours(0, 0, 0, 0);
    return birth.getTime() > today.getTime();
  }

  function isAdultDob(dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
    const parts = dob.split("-");
    const birth = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );
    if (Number.isNaN(birth.getTime())) return false;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age -= 1;
    }
    return age >= 18;
  }

  function validateDobValue(dob) {
    const value = String(dob || "").trim();
    if (!value) return "Date of birth is required.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return "Enter a valid date of birth (YYYY-MM-DD).";
    }
    if (isFutureDob(value)) {
      return "Date of birth cannot be in the future.";
    }
    if (!isAdultDob(value)) {
      return "You must be at least 18 years old.";
    }
    return null;
  }

  function validateReferralLeadFormFields(fields) {
    const errors = {};
    const fullName = fields.fullName.trim();
    const mobile = normalizeReferralLeadMobile(fields.mobile);
    const city = fields.city.trim();
    const area = fields.area.trim();
    const pincode = fields.pincode.trim();
    const dob = fields.dob.trim();

    if (fullName.length < 2) errors.fullName = "Full name is required.";
    if (!mobile) errors.mobile = "Mobile number is required.";
    else if (!/^\d{10}$/.test(mobile)) {
      errors.mobile = "Enter a valid 10-digit mobile number.";
    }
    if (city.length < 2) errors.city = "City is required.";
    if (!area) errors.area = "Area is required.";
    if (!pincode) errors.pincode = "Pincode is required.";
    else if (!/^\d{6}$/.test(pincode)) {
      errors.pincode = "Enter a valid 6-digit pincode.";
    }
    if (!dob) errors.dob = "Date of birth is required.";
    else {
      const dobError = validateDobValue(dob);
      if (dobError) errors.dob = dobError;
    }

    return errors;
  }

  function applyReferralLeadFieldErrors(panel, errors) {
    panel.querySelectorAll("[data-rl-error]").forEach(function (node) {
      const key = node.getAttribute("data-rl-error");
      const message = errors[key] || "";
      node.textContent = message;
      node.classList.toggle("rl-show", Boolean(message));
      const input = panel.querySelector('[data-rl-field="' + key + '"]');
      if (input) input.classList.toggle("rl-invalid", Boolean(message));
    });
  }

  function readReferralLeadFormFields(panel) {
    return {
      fullName: panel.querySelector('[data-rl-field="fullName"]')?.value || "",
      mobile: panel.querySelector('[data-rl-field="mobile"]')?.value || "",
      city: panel.querySelector('[data-rl-field="city"]')?.value || "",
      area: panel.querySelector('[data-rl-field="area"]')?.value || "",
      pincode: panel.querySelector('[data-rl-field="pincode"]')?.value || "",
      dob: panel.querySelector('[data-rl-field="dob"]')?.value || "",
    };
  }

  const REFER_FRIENDS_TITLE = "Refer with your friends and family";

  function renderPreparingNextStepHtml() {
    return '<p class="rl-preparing"><strong>Preparing you for the next step…</strong></p>';
  }

  function clearReferralLeadRevealTimers(panel) {
    if (!panel || !panel._revealTimers) return;
    panel._revealTimers.forEach(function (timerId) {
      window.clearTimeout(timerId);
    });
    panel._revealTimers = [];
  }

  function revealReferralLeadCompletionSteps(panel, hasShareDetails) {
    clearReferralLeadRevealTimers(panel);
    panel._revealTimers = [];

    const preparing = panel.querySelector("[data-rl-preparing]");
    const ctaRow = panel.querySelector("[data-rl-cta-row]");
    if (preparing) preparing.classList.add("hidden");
    if (hasShareDetails && ctaRow) ctaRow.classList.remove("hidden");
  }

  function getVerificationMessageFromRegistration(registration) {
    return (
      (registration &&
        registration.messages &&
        (registration.messages.whatsapp_submission_confirmation ||
          registration.messages.submission_confirmation) &&
        (registration.messages.whatsapp_submission_confirmation ||
          registration.messages.submission_confirmation).message) ||
      ""
    );
  }

  async function resolveReferralLeadLoginWhatsAppMessage() {
    const details = window.__concaveReferralLead || {};
    let registration = window.__concaveConsentDeclineRegistration || null;

    let message = getVerificationMessageFromRegistration(registration);
    if (message) return message;

    const cached = resolveCachedRenderedMessage(
      TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION,
    );
    if (cached && cached.message) return String(cached.message);

    if (submitConsentDeclineTermination.promise) {
      try {
        registration =
          (await submitConsentDeclineTermination.promise) || registration;
        message = getVerificationMessageFromRegistration(registration);
        if (message) return message;
      } catch (error) {
        console.warn(
          "[ConcaveRegistrationBridge] waiting for consent termination failed:",
          error,
        );
      }
    }

    return renderSubmissionConfirmationMessage({
      fullName:
        (registration && registration.fullName) || details.fullName || "",
      mobile: (registration && registration.mobile) || details.mobile || "",
      leadId: (registration && registration.leadId) || "",
      referralLink:
        (registration && registration.referralLink) || details.referralLink || "",
    });
  }

  function bindReferralLeadThankYouCtas(container) {
    const details = window.__concaveReferralLead || {};
    const referralCode = details.referralCode || "";
    const referralLink = details.referralLink || "";

    container
      .querySelector("[data-rl-open-share]")
      ?.addEventListener("click", function () {
        if (!referralCode || !referralLink) return;
        showReferralInviteModal({
          referralLeadMode: true,
          referralCode: referralCode,
          referralLink: referralLink,
          instagramTemplateKey: TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
          whatsappTemplateKey: TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL,
        });
      });

    container
      .querySelector("[data-rl-dm-wa]")
      ?.addEventListener("click", function () {
        void resolveReferralLeadLoginWhatsAppMessage()
          .then(function (message) {
            if (!String(message || "").trim()) {
              showCopiedToast("Could not prepare your message.");
              return;
            }
            window.open(
              buildWhatsAppVerificationUrl(message),
              "_blank",
              "noopener,noreferrer",
            );
          })
          .catch(function (error) {
            console.error("Failed to open WhatsApp verification:", error);
            showCopiedToast("Could not prepare your message.");
          });
      });
  }

  function buildReferralLeadWhatsAppMessage(referralCode, referralLink) {
    return (
      "Hi!\n\n" +
      "I found this survey and thought you might be interested.\n\n" +
      "Use my referral code:\n" +
      referralCode +
      "\n\n" +
      "Complete the survey here:\n" +
      referralLink +
      "\n\n" +
      "Thanks!"
    );
  }

  function markReferralLeadShared(referralCode, platform) {
    return fetch(
      "/api/referral-leads/" + encodeURIComponent(referralCode) + "/shared",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform }),
      },
    ).catch(function (error) {
      console.warn("[ConcaveRegistrationBridge] markShared failed:", error);
    });
  }

  function openReferralLeadShareModal(result) {
    window.__concaveReferralLead = {
      referralCode: result.referral_code || result.referralCode || "",
      referralLink: result.referral_link || result.referralLink || "",
      fullName: result.fullName || result.full_name || "",
      mobile: result.mobile || "",
    };
    showReferralLeadCompletionState(window.__concaveReferralLead);
    if (result.message) {
      showCopiedToast(result.message);
    }
  }

  function dismissReferralLeadShareModal() {
    closeReferralInviteModal();
    showReferralLeadCompletionState(window.__concaveReferralLead || {});
  }

  function showReferralLeadCompletionState(details) {
    ensureReferEarnStyles();

    document.querySelectorAll(".screen").forEach(function (screen) {
      if (screen.id !== "s-referral-lead-complete") {
        screen.classList.add("hidden");
      }
    });

    const bar = document.getElementById("bar");
    if (bar) bar.style.width = "100%";

    let panel = document.getElementById("s-referral-lead-complete");
    if (!panel) {
      const wrap = document.querySelector(".wrap");
      panel = document.createElement("div");
      panel.id = "s-referral-lead-complete";
      panel.className = "card screen";
      if (wrap) wrap.appendChild(panel);
      else document.body.appendChild(panel);
    }

    const hasShareDetails =
      details && (details.referralCode || details.referralLink);

    panel.innerHTML =
      '<div class="center">' +
      '<div class="big">Thank you!</div>' +
      "<p>Your referral details were saved.</p>" +
      '<p>Share with your friends and family who may be interested in this study.</p>' +
      (hasShareDetails
        ? '<div class="rl-cta-row" data-rl-cta-row>' +
          '<button type="button" class="rl-cta rl-cta-wa" data-rl-dm-wa>DM us on WhatsApp<small>to get your login details</small></button>' +
          '<button type="button" class="rl-cta rl-cta-share" data-rl-open-share>Share<small>Invite your friends</small></button>' +
          "</div>"
        : "") +
      "</div>";

    bindReferralLeadThankYouCtas(panel);

    panel.classList.remove("hidden");
    window.scrollTo(0, 0);
    revealReferralLeadCompletionSteps(panel, hasShareDetails);
  }

  async function submitReferralLeadCaptureForm(panel, referredBy) {
    const submitBtn = panel.querySelector("[data-rl-submit]");
    const fields = readReferralLeadFormFields(panel);
    const errors = validateReferralLeadFormFields(fields);
    applyReferralLeadFieldErrors(panel, errors);
    if (Object.keys(errors).length > 0) return;

    const mobile = normalizeReferralLeadMobile(fields.mobile);
    if (/^\d{10}$/.test(mobile)) {
      const exists = await checkParticipantMobileExists(mobile);
      if (exists) {
        showAlreadyRegisteredDialog(fields.mobile.trim());
        return;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Preparing you for the next step…";
    }

    try {
      const response = await fetch("/api/referral-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fields.fullName.trim(),
          mobile: normalizeReferralLeadMobile(fields.mobile),
          city: fields.city.trim(),
          area: fields.area.trim(),
          pincode: fields.pincode.trim(),
          dob: fields.dob.trim(),
          referredBy: referredBy || undefined,
        }),
      });
      const payload = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        if (payload.errors && typeof payload.errors === "object") {
          applyReferralLeadFieldErrors(panel, payload.errors);
          return;
        }
        showCopiedToast(
          payload.error || "Could not save your referral details.",
        );
        return;
      }

      closeReferralLeadCaptureForm();
      window.__concaveConsentReferrerOnly = true;
      openReferralLeadShareModal({
        ...payload,
        fullName: fields.fullName.trim(),
        mobile: normalizeReferralLeadMobile(fields.mobile),
      });
      void submitConsentDeclineTermination({
        fullName: fields.fullName.trim(),
        mobile: normalizeReferralLeadMobile(fields.mobile),
        city: fields.city.trim(),
        dob: fields.dob.trim(),
      });
    } catch (error) {
      console.error("Failed to create referral lead:", error);
      showCopiedToast("Network error. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit";
      }
    }
  }

  function showReferralLeadCaptureForm(referredBy) {
    ensureReferEarnStyles();
    closeReferralLeadCaptureForm();
    closeConsentReferEarnPopup();
    window.__concaveConsentReferrerOnly = true;

    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.classList.add("hidden");
    });

    const overlay = document.createElement("div");
    overlay.id = "referral-lead-capture-overlay";

    const panel = document.createElement("div");
    panel.id = "referral-lead-capture-panel";

    panel.innerHTML =
      '<h2 class="rl-title">' +
      escapeHtml(REFER_FRIENDS_TITLE) +
      "</h2>" +
      '<p class="rl-subtitle">Share your details so we can send you a personal referral link.</p>' +
      '<div class="rl-field"><label class="rl-label" for="rl-full-name">Name</label>' +
      '<input id="rl-full-name" class="rl-input" data-rl-field="fullName" type="text" autocomplete="name">' +
      '<p class="rl-error" data-rl-error="fullName"></p></div>' +
      '<div class="rl-field"><label class="rl-label" for="rl-mobile">Mobile</label>' +
      '<input id="rl-mobile" class="rl-input" data-rl-field="mobile" type="tel" maxlength="10" autocomplete="tel">' +
      '<p class="rl-error" data-rl-error="mobile"></p></div>' +
      '<div class="rl-field"><label class="rl-label" for="rl-city">City</label>' +
      '<input id="rl-city" class="rl-input" data-rl-field="city" type="text" autocomplete="address-level2">' +
      '<p class="rl-error" data-rl-error="city"></p></div>' +
      '<div class="rl-field"><label class="rl-label" for="rl-area">Area</label>' +
      '<input id="rl-area" class="rl-input" data-rl-field="area" type="text" autocomplete="address-level3">' +
      '<p class="rl-error" data-rl-error="area"></p></div>' +
      '<div class="rl-field"><label class="rl-label" for="rl-pincode">Pincode</label>' +
      '<input id="rl-pincode" class="rl-input" data-rl-field="pincode" type="text" maxlength="6" inputmode="numeric">' +
      '<p class="rl-error" data-rl-error="pincode"></p></div>' +
      '<div class="rl-field"><label class="rl-label" for="rl-dob">Date of Birth</label>' +
      '<input id="rl-dob" class="rl-input" data-rl-field="dob" type="date">' +
      '<p class="rl-error" data-rl-error="dob"></p></div>' +
      '<div class="rl-actions">' +
      '<button type="button" class="rl-btn rl-btn-submit" data-rl-submit>Submit</button>' +
      "</div>";

    panel
      .querySelector("[data-rl-submit]")
      ?.addEventListener("click", function () {
        void submitReferralLeadCaptureForm(panel, referredBy);
      });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    configureDobDateInput(panel.querySelector('[data-rl-field="dob"]'));
    installReferralLeadMobileCheck(panel);
    window.scrollTo(0, 0);
  }

  function closeConsentReferEarnPopup() {
    const existing = document.getElementById("consent-refer-earn-overlay");
    if (existing) existing.remove();
  }

  function ensureConsentTerminationFlags() {
    window.__terminated = true;
    if (!window.__concaveConsentDeclined) {
      window.__concaveConsentDeclined = true;
    }
    var reasons = Array.isArray(window.__termReasons)
      ? window.__termReasons.slice()
      : [];
    if (reasons.indexOf("consent") < 0) {
      reasons.push("consent");
    }
    window.__termReasons = reasons;
  }

  async function submitConsentDeclineTermination(overrides) {
    if (submitConsentDeclineTermination.promise) {
      return submitConsentDeclineTermination.promise;
    }

    const fullName =
      (overrides && overrides.fullName) ||
      document.querySelector("[name=name]")?.value?.trim() ||
      "";
    const mobile =
      (overrides && overrides.mobile) ||
      document.querySelector("[name=phone]")?.value?.trim() ||
      "";
    const city =
      (overrides && overrides.city) ||
      document.querySelector("[name=city]")?.value?.trim() ||
      document.querySelector("[name=area]")?.value?.trim() ||
      "";
    const dob = (overrides && overrides.dob) || buildDobIso();

    if (!fullName || !mobile || !city || !dob) {
      trackConcaveEvent("Consent Termination Pending", {
        ruleKey: "consent",
        reason: "missing_contact_fields",
      });
      return null;
    }

    ensureConsentTerminationFlags();
    syncTerminationState();

    submitConsentDeclineTermination.promise = (async function () {
      try {
        const tracking = collectSubmissionAnalytics();
        const attribution = getReferrerAttribution();
        const deviceFingerprint = await resolveDeviceFingerprint();
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            mobile,
            dob,
            city,
            referrerCode: attribution.code || undefined,
            referralPlatform: attribution.platform || undefined,
            answers: collectScreenerAnswers(),
            answerJson: collectFtvAnswerJson(),
            responseTimes: tracking.responseTimes,
            analytics: tracking.analytics || undefined,
            startedAt: tracking.startedAt || submitRegistration.startedAt,
            submittedAt: new Date().toISOString(),
            terminated: true,
            terminations: collectTerminationPayload(),
            deviceFingerprint: deviceFingerprint || undefined,
          }),
        });

        if (!response.ok) {
          submitConsentDeclineTermination.promise = null;
          const data = await response.json().catch(function () {
            return {};
          });
          if (data.code === "DUPLICATE_MOBILE") {
            trackConcaveEvent("Consent Termination Recorded", {
              ruleKey: "consent",
              note: "existing_participant",
            });
            return null;
          }
          console.warn(
            "[ConcaveRegistrationBridge] consent termination register failed:",
            data.error || response.status,
          );
          return null;
        }

        trackConcaveEvent("Consent Termination Recorded", {
          ruleKey: "consent",
        });
        const data = await response.json().catch(function () {
          return {};
        });
        window.__concaveConsentDeclineRegistration = data;
        persistRegistrationResult(data);
        return data;
      } catch (error) {
        submitConsentDeclineTermination.promise = null;
        console.warn(
          "[ConcaveRegistrationBridge] consent termination failed:",
          error,
        );
        return null;
      }
    })();

    return submitConsentDeclineTermination.promise;
  }

  submitConsentDeclineTermination.promise = null;

  function showConsentPoliteCompletion() {
    ensureConsentTerminationFlags();
    window.__concaveConsentPoliteComplete = true;
    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.classList.add("hidden");
    });
    const bar = document.getElementById("bar");
    if (bar) bar.style.width = "100%";

    let panel = document.getElementById("s-consent-polite");
    if (!panel) {
      const wrap = document.querySelector(".wrap");
      panel = document.createElement("div");
      panel.id = "s-consent-polite";
      panel.className = "card screen";
      if (wrap) wrap.appendChild(panel);
      else document.body.appendChild(panel);
    }

    panel.innerHTML =
      '<div class="center">' +
      '<div class="big">Thank you!</div>' +
      "<p>We completely respect your decision.</p>" +
      "<p>Thank you for your time.</p>" +
      renderPreparingNextStepHtml() +
      "</div>";

    panel.classList.remove("hidden");
    window.scrollTo(0, 0);
    void submitConsentDeclineTermination();
  }

  function showConsentReferEarnPopup(onContinue) {
    closeConsentReferEarnPopup();

    const overlay = document.createElement("div");
    overlay.id = "consent-refer-earn-overlay";

    const panel = document.createElement("div");
    panel.id = "consent-refer-earn-panel";

    panel.innerHTML =
      '<h2 class="cre-title">' +
      escapeHtml(REFER_FRIENDS_TITLE) +
      "</h2>" +
      '<p class="cre-subtitle">We completely respect your decision.</p>' +
      '<p class="cre-desc">This study isn&apos;t a fit right now, but you can still refer friends or family who may be interested.</p>' +
      '<div class="cre-actions">' +
      '<button type="button" class="cre-btn cre-btn-yes" data-cre-yes>Yes</button>' +
      '<button type="button" class="cre-btn cre-btn-no" data-cre-no>No</button>' +
      "</div>";

    panel
      .querySelector("[data-cre-yes]")
      ?.addEventListener("click", function () {
        closeConsentReferEarnPopup();
        trackConcaveEvent("Referral Flow Started");
        onContinue();
      });

    panel
      .querySelector("[data-cre-no]")
      ?.addEventListener("click", function () {
        closeConsentReferEarnPopup();
        trackConcaveEvent("Referral Declined");
        showConsentPoliteCompletion();
      });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    trackConcaveEvent("Referral Popup Opened");
  }

  function handleConsentDeclined(onContinueToReferral) {
    ensureConsentTerminationFlags();
    trackConcaveEvent("Consent Declined", { ruleKey: "consent" });
    showConsentReferEarnPopup(onContinueToReferral);
  }

  function installConsentReferInterceptor(showResultFn, referrerRef) {
    if (document.documentElement.dataset.concaveConsentIntercept === "1")
      return;
    document.documentElement.dataset.concaveConsentIntercept = "1";

    document.addEventListener(
      "click",
      function (event) {
        if (window.__concaveConsentPoliteComplete) return;

        const nextBtn = event.target.closest("[data-next]");
        if (!nextBtn) return;

        if (!isConsentScreenVisible()) return;
        if (!consentScreenHasSelection() || !isConsentNoSelected()) return;

        event.stopImmediatePropagation();
        event.preventDefault();

        handleConsentDeclined(function () {
          showReferralLeadCaptureForm(referrerRef);
        });
      },
      true,
    );
  }

  function showReferralInviteModal(options) {
    ensureReferEarnStyles();
    closeReferralInviteModal();
    closeInstagramDmGuideModal();

    const referralLeadMode = Boolean(options && options.referralLeadMode);
    const referralCode =
      (options && options.referralCode) ||
      window.__concaveReferralLead?.referralCode ||
      "";
    const referralLink =
      (options && options.referralLink) ||
      window.__concaveReferralLead?.referralLink ||
      "";

    const overlay = document.createElement("div");
    overlay.id = "referral-invite-overlay";

    const panel = document.createElement("div");
    panel.id = "referral-invite-panel";

    panel.innerHTML =
      '<h2 class="ri-title">Share with your friends and family</h2>' +
      '<p class="ri-desc">Share this personalized referral link with your friends &amp; family.</p>' +
      '<div class="ri-actions">' +
      (referralLeadMode
        ? '<button type="button" class="ri-btn ri-btn-copy" data-refer-copy>Copy Link</button>'
        : "") +
      '<button type="button" class="ri-btn ri-btn-ig" data-refer-ig>Share on Instagram</button>' +
      '<button type="button" class="ri-btn ri-btn-wa" data-refer-wa>Share on WhatsApp</button>' +
      "</div>";

    if (referralLeadMode) {
      panel
        .querySelector("[data-refer-copy]")
        ?.addEventListener("click", function () {
          if (!referralLink) return;
          navigator.clipboard
            .writeText(referralLink)
            .then(function () {
              showCopiedToast("Copied Successfully");
              void markReferralLeadShared(referralCode, "copy");
            })
            .catch(function () {
              showCopiedToast("Could not copy the referral link.");
            });
        });
    }

    panel
      .querySelector("[data-refer-ig]")
      ?.addEventListener("click", function () {
        trackConcaveEvent("Referral Shared", { channel: "instagram" });

        if (referralLeadMode && referralCode && referralLink) {
          const message = buildReferralLeadWhatsAppMessage(
            referralCode,
            referralLink,
          );
          void markReferralLeadShared(referralCode, "instagram");
          dismissReferralLeadShareModal();
          shareOnInstagram(message, DEFAULT_INSTAGRAM_DM_URL);
          return;
        }

        closeReferralInviteModal();

        void fetchRenderedParticipantMessage(
          options.instagramTemplateKey,
          "instagram",
        )
          .then(function (rendered) {
            shareOnInstagram(rendered.message, rendered.instagramDmUrl);
          })
          .catch(function (error) {
            console.error("Failed to open Instagram share:", error);
            showCopiedToast("Could not prepare your share message.");
          });
      });

    panel
      .querySelector("[data-refer-wa]")
      ?.addEventListener("click", function () {
        trackConcaveEvent("Referral Shared", { channel: "whatsapp" });

        if (referralLeadMode && referralCode && referralLink) {
          const message = buildReferralLeadWhatsAppMessage(
            referralCode,
            referralLink,
          );
          void markReferralLeadShared(referralCode, "whatsapp");
          dismissReferralLeadShareModal();
          window.open(
            buildWhatsAppShareUrl(message),
            "_blank",
            "noopener,noreferrer",
          );
          return;
        }

        closeReferralInviteModal();

        void fetchRenderedParticipantMessage(
          options.whatsappTemplateKey,
          "whatsapp",
        )
          .then(function (rendered) {
            window.open(
              buildWhatsAppShareUrl(rendered.message),
              "_blank",
              "noopener,noreferrer",
            );
          })
          .catch(function (error) {
            console.error("Failed to open WhatsApp share:", error);
            showCopiedToast("Could not prepare your share message.");
          });
      });

    overlay.appendChild(panel);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeReferralInviteModal();
      }
    });
    panel.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    document.body.appendChild(overlay);
  }

  function showInstagramShareModal(message, dmUrl) {
    closeInstagramDmGuideModal();

    const overlay = document.createElement("div");
    overlay.id = "instagram-dm-guide-overlay";

    const panel = document.createElement("div");
    panel.id = "instagram-dm-guide-panel";

    const title = "Share on Instagram";
    const description =
      '<strong style="font-weight:600">Preparing you for the next step:</strong> We&apos;ve copied your referral message. Tap Continue to open Instagram and paste it.';

    panel.innerHTML =
      '<h2 class="ig-title">' +
      escapeHtml(title) +
      "</h2>" +
      '<p class="ig-desc">' +
      description +
      "</p>" +
      '<p class="ig-copy-hint hidden">Couldn\'t copy automatically. <button type="button" data-ig-copy>Tap to copy message</button></p>' +
      '<div class="ig-actions">' +
      '<button type="button" class="ig-btn ig-btn-open" data-ig-open>Continue to Instagram →</button>' +
      "</div>";

    const copyHint = panel.querySelector(".ig-copy-hint");

    function handleCopy(showToast) {
      return copyInstagramMessage(message).then(function (copied) {
        if (copied) {
          if (copyHint) copyHint.classList.add("hidden");
          if (showToast) {
            showCopiedToast("✅ Message copied to clipboard");
          }
        } else if (copyHint) {
          copyHint.classList.remove("hidden");
        }
        return copied;
      });
    }

    panel
      .querySelector("[data-ig-copy]")
      ?.addEventListener("click", function () {
        void handleCopy(true);
      });

    panel
      .querySelector("[data-ig-open]")
      ?.addEventListener("click", function () {
        void dmUrl;
        openInstagramReferralComposer();
        closeInstagramDmGuideModal();
      });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    void handleCopy(true).then(function (copied) {
      if (!copied && copyHint) copyHint.classList.remove("hidden");
    });
  }

  function showInstagramVerificationModal(message, dmUrl) {
    closeInstagramDmGuideModal();

    const overlay = document.createElement("div");
    overlay.id = "instagram-dm-guide-overlay";

    const panel = document.createElement("div");
    panel.id = "instagram-dm-guide-panel";

    panel.innerHTML =
      '<h2 class="ig-title">Verify via Instagram</h2>' +
      '<ul class="ig-instructions">' +
      "<li>We are going to open our official Instagram DM.</li>" +
      "<li>Copy/paste the generated verification details.</li>" +
      "<li>Send them to our team.</li>" +
      "<li>Once verified, our team will send your survey link via Instagram DM.</li>" +
      "<li>Do not close Instagram until you have sent the message.</li>" +
      "</ul>" +
      '<p class="ig-copy-hint hidden">Couldn&apos;t copy automatically. <button type="button" data-ig-copy>Tap to copy message</button></p>' +
      '<p class="ig-copy-status hidden">Verification message copied to clipboard.</p>' +
      '<div class="ig-actions">' +
      '<button type="button" class="ig-btn ig-btn-continue" data-ig-open>Continue</button>' +
      "</div>";

    const copyHint = panel.querySelector(".ig-copy-hint");
    const copyStatus = panel.querySelector(".ig-copy-status");

    panel
      .querySelector("[data-ig-copy]")
      ?.addEventListener("click", function () {
        void copyInstagramMessage(message).then(function (copied) {
          if (copied) {
            if (copyHint) copyHint.classList.add("hidden");
            if (copyStatus) copyStatus.classList.remove("hidden");
            showCopiedToast("Copied successfully");
          } else if (copyHint) {
            copyHint.classList.remove("hidden");
          }
        });
      });

    panel
      .querySelector("[data-ig-open]")
      ?.addEventListener("click", function () {
        openInstagramInbox(dmUrl);
        closeInstagramDmGuideModal();
      });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    void copyInstagramMessage(message).then(function (copied) {
      if (!copied && copyHint) copyHint.classList.remove("hidden");
      if (copied) {
        if (copyStatus) copyStatus.classList.remove("hidden");
        showCopiedToast("Copied successfully");
      }
    });
  }

  function shareOnInstagram(message, dmUrl) {
    showInstagramShareModal(message, dmUrl);
  }

  function verifyViaInstagram(message, dmUrl) {
    showInstagramVerificationModal(message, dmUrl);
  }

  function showCopiedToast(message, description) {
    const existing = document.getElementById("registration-toast");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "registration-toast";
    banner.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:#E2F0EC;color:#1F5C4D;border:1px solid #C9E5DE;border-radius:12px;padding:14px 16px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.12)";
    banner.innerHTML =
      "<strong>" +
      message +
      "</strong>" +
      (description
        ? "<div style='margin-top:4px;opacity:.9'>" + description + "</div>"
        : "");
    document.body.appendChild(banner);
    window.setTimeout(function () {
      banner.remove();
    }, 3500);
  }

  function buildWhatsAppShareUrl(message) {
    return "https://wa.me/?text=" + encodeURIComponent(message);
  }

  function buildWhatsAppVerificationUrl(message) {
    return (
      "https://wa.me/" +
      DEFAULT_WHATSAPP_BUSINESS_NUMBER +
      "?text=" +
      encodeURIComponent(message)
    );
  }

  async function loadMessageTemplates() {
    const response = await fetch("/api/message-templates");
    if (!response.ok) throw new Error("Failed to load message templates.");
    const payload = await response.json().catch(function () {
      return {};
    });
    return {
      templates: payload.templates || {},
      instagramDmUrl: payload.instagram?.dmUrl || DEFAULT_INSTAGRAM_DM_URL,
    };
  }

  function fillMessageTemplate(template, context) {
    return String(template || "").replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      function (_, key) {
        const value = context[key];
        return value == null ? "" : String(value);
      },
    );
  }

  function resolveSubmissionConfirmationKey(templates) {
    for (var i = 0; i < SUBMISSION_CONFIRMATION_ALIASES.length; i++) {
      var alias = SUBMISSION_CONFIRMATION_ALIASES[i];
      var aliased = templates[alias];
      if (
        aliased &&
        aliased.enabled !== false &&
        String(aliased.template || "").trim()
      ) {
        return alias;
      }
    }
    var keys = Object.keys(templates || {});
    for (var j = 0; j < keys.length; j++) {
      var item = templates[keys[j]];
      var title = String((item && item.title) || "").toLowerCase();
      if (
        item &&
        item.enabled !== false &&
        item.channel === "whatsapp" &&
        String(item.template || "").trim() &&
        /submission\s*confirm/.test(title)
      ) {
        return keys[j];
      }
    }
    return TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION;
  }

  function submissionConfirmationContext(details) {
    const fullName = String((details && details.fullName) || "").trim();
    const mobile = String((details && details.mobile) || "").trim();
    const leadId = String((details && details.leadId) || "").trim();
    const referralLink = String((details && details.referralLink) || "").trim();
    return {
      participant_name: fullName,
      name: fullName,
      full_name: fullName,
      mobile: mobile,
      phone: mobile,
      lead_id: leadId,
      leadId: leadId,
      referral_link: referralLink,
    };
  }

  async function renderSubmissionConfirmationMessage(details) {
    const cached = resolveCachedRenderedMessage(
      TEMPLATE_KEYS.WHATSAPP_SUBMISSION_CONFIRMATION,
    );
    if (cached && cached.message) return String(cached.message);

    try {
      const loaded = await loadMessageTemplates();
      const templates = loaded.templates || {};
      const key = resolveSubmissionConfirmationKey(templates);
      const entry = templates[key];
      if (!entry || !String(entry.template || "").trim()) return "";
      return fillMessageTemplate(
        entry.template,
        submissionConfirmationContext(details || {}),
      );
    } catch (error) {
      console.warn("Submission confirmation template unavailable:", error);
      return "";
    }
  }

  function openWhatsAppWithTemplateMessage(message) {
    if (!String(message || "").trim()) {
      showCopiedToast("Could not prepare your message.");
      return;
    }
    window.open(
      buildWhatsAppVerificationUrl(message),
      "_blank",
      "noopener,noreferrer",
    );
  }

  function normalizeRegistrationStatus(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function isTerminatedRegistrationStatus(status) {
    const normalized = normalizeRegistrationStatus(status);
    return normalized === "not_eligible" || normalized === "terminated";
  }

  function resolveThankYouChannels(status) {
    const terminated = isTerminatedRegistrationStatus(status);
    return {
      loginChannel: "whatsapp",
      shareChannel: terminated ? "whatsapp" : "instagram",
    };
  }

  function loginDmSubtitle(channel) {
    return channel === "instagram" ? "DM us on Instagram" : "DM us on WhatsApp";
  }

  function shareDmSubtitle(channel) {
    return channel === "instagram" ? "DM on Instagram" : "DM on WhatsApp";
  }

  function createThankYouButton(label, subtitle, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cta " + className;
    button.innerHTML =
      label + (subtitle ? "<small>" + subtitle + "</small>" : "");
    button.addEventListener("click", function (event) {
      event.preventDefault();
      onClick();
    });
    return button;
  }

  function clearRegistrationCompletePending() {
    try {
      window.localStorage.removeItem("concave.registrationCompletePending");
    } catch (error) {
      // Ignore storage errors in embedded forms.
    }
  }

  async function completeRegistrationOnForm(registration, options) {
    clearRegistrationCompletePending();
    persistRegistrationResult(registration);

    try {
      showCopiedToast("Registration completed successfully.");
      await mountThankYouExperience(registration);
    } catch (error) {
      console.error(
        "[ConcaveRegistrationBridge] thank-you mount failed:",
        error,
      );
      await mountThankYouExperience(registration);
    }

    if (options && options.openReferralModal) {
      const terminated = isTerminatedRegistrationStatus(registration.status);
      showReferralInviteModal({
        instagramTemplateKey: TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
        whatsappTemplateKey: terminated
          ? TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL
          : TEMPLATE_KEYS.WHATSAPP_REFERRAL,
      });
      window.__concaveConsentReferrerOnly = false;
    }
  }

  async function fetchRenderedParticipantMessage(templateKey, platform) {
    const cached = resolveCachedRenderedMessage(templateKey);
    if (cached) {
      return {
        message: String(cached.message || ""),
        instagramDmUrl: cached.instagramDmUrl || DEFAULT_INSTAGRAM_DM_URL,
      };
    }

    const params = new URLSearchParams({ key: templateKey });
    if (platform) params.set("platform", platform);

    const response = await fetch(
      "/api/participant/render-message?" + params.toString(),
      { credentials: "include" },
    );
    const payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(payload.error || "Failed to render message.");
    }

    return {
      message: String(payload.message || ""),
      instagramDmUrl: payload.instagramDmUrl || DEFAULT_INSTAGRAM_DM_URL,
    };
  }

  async function mountThankYouExperience(registration) {
    const screen = getVisibleScreen();
    const host = getResultHost(screen);
    if (!host) return;

    ensureResultMountPoints(host);

    const status = registration.status || "completed";
    const terminated = isTerminatedRegistrationStatus(status);

    restoreLegacyResultCopy(host);

    const referEarn = getReferEarnContainer(screen);
    if (referEarn) {
      referEarn.classList.remove("hidden");
      referEarn.innerHTML =
        '<p class="ty-refer-earn-loading"><strong>Preparing your next steps…</strong></p>';
    }

    const channelNote = host.querySelector("[data-concave-channel-note]");
    if (channelNote) channelNote.remove();

    const container = getCtaContainer(screen);
    if (!container) return;

    const whatsappReferralTemplateKey = terminated
      ? TEMPLATE_KEYS.NOT_ELIGIBLE_REFERRAL
      : TEMPLATE_KEYS.WHATSAPP_REFERRAL;
    const instagramReferralTemplateKey = TEMPLATE_KEYS.INSTAGRAM_REFERRAL;

    container.innerHTML = "";
    container.classList.remove("hidden");

    const whatsappContactButton = createThankYouButton(
      "DM us on WhatsApp",
      "Message the study team",
      "cta-wa",
      function () {
        void renderSubmissionConfirmationMessage({
          fullName: registration.fullName,
          mobile: registration.mobile,
          leadId: registration.leadId,
          referralLink: registration.referralLink,
        }).then(openWhatsAppWithTemplateMessage);
      },
    );

    const referralButton = createThankYouButton(
      "Share",
      "Invite your friends",
      "cta-ref",
      function () {
        showReferralInviteModal({
          instagramTemplateKey: instagramReferralTemplateKey,
          whatsappTemplateKey: whatsappReferralTemplateKey,
        });
      },
    );

    container.appendChild(whatsappContactButton);
    container.appendChild(referralButton);

    await mountPostSurveyReferEarnPanel(registration);
  }

  async function mountThankYouCtas(registration) {
    await mountThankYouExperience(registration);
  }

  function closeAlreadyRegisteredDialog() {
    const existing = document.getElementById("already-registered-dialog");
    if (existing) existing.remove();
  }

  function showAlreadyRegisteredDialog(mobile) {
    closeAlreadyRegisteredDialog();

    const overlay = document.createElement("div");
    overlay.id = "already-registered-dialog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px";

    const panel = document.createElement("div");
    panel.style.cssText =
      "width:100%;max-width:28rem;border-radius:12px;border:1px solid #E7E2EA;background:#fff;padding:24px;box-shadow:0 16px 40px rgba(0,0,0,.18)";

    const title = document.createElement("h2");
    title.textContent = "Already Registered";
    title.style.cssText =
      "margin:0 0 12px;font-size:18px;line-height:1.2;font-weight:600;color:#1F1528";

    const body = document.createElement("p");
    body.textContent =
      "You're already registered with this mobile number.\n\nPlease log in to continue.";
    body.style.cssText =
      "margin:0 0 20px;white-space:pre-line;font-size:14px;line-height:1.5;color:#6B5B73";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:stretch";

    const loginButton = document.createElement("button");
    loginButton.type = "button";
    loginButton.textContent = "Login";
    loginButton.style.cssText =
      "width:100%;border:none;border-radius:8px;background:#8B1E4A;color:#fff;padding:10px 14px;font-size:14px;font-weight:600;cursor:pointer";

    loginButton.addEventListener("click", function () {
      const params = new URLSearchParams();
      if (mobile) params.set("mobile", mobile);
      const query = params.toString();
      const target = window.top || window;
      target.location.href = query ? "/login?" + query : "/login";
    });

    panel.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    actions.appendChild(loginButton);
    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    loginButton.focus();
  }

  function startSurveyAnalytics() {
    try {
      if (
        window.SurveyAnalytics &&
        typeof window.SurveyAnalytics.start === "function"
      ) {
        const root =
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

    const times = {};
    for (const [fieldName, metrics] of Object.entries(analytics.questions)) {
      // Only screener question fields map to a Q-key. Core fields (name,
      // phone, city, dob_*) have no Q-key and must NOT be sent as response
      // times, or server validation rejects keys like "name".
      const qKey = fieldToQ(fieldName);
      if (!qKey) continue;
      times[qKey] = Math.max(0, Math.round((metrics.time_ms || 0) / 1000));
    }
    return Object.keys(times).length > 0 ? times : null;
  }

  function collectAcquisition() {
    // Capture the "How did you hear about this survey?" answer when the served
    // form includes acquisition_source / other_source fields. Stays null-safe
    // (returns empty strings) when the form has no such fields.
    const sourceField =
      document.querySelector('input[name="acquisition_source"]:checked') ||
      document.querySelector('select[name="acquisition_source"]') ||
      document.querySelector('[name="acquisition_source"]');
    const otherField = document.querySelector('[name="other_source"]');

    const source = sourceField?.value?.trim() || "";
    const other = otherField?.value?.trim() || "";

    return { source, other: source === "Other" ? other : "" };
  }

  function collectSubmissionAnalytics() {
    const analytics = exportSurveyAnalytics();
    const screenId =
      (window.ConcaveFormDraft &&
        window.ConcaveFormDraft.getVisibleScreenId()) ||
      document.querySelector(".screen:not(.hidden)")?.id ||
      "";
    return {
      analytics,
      responseTimes: resolveResponseTimes(analytics),
      startedAt: analytics?.survey?.started_at || submitRegistration.startedAt,
      submittedAt: analytics?.survey?.submitted_at || new Date().toISOString(),
      currentScreen: screenId,
      lastScreen: screenId,
    };
  }

  function getReferrerAttribution() {
    var stored = window.ConcaveReferralAttribution
      ? window.ConcaveReferralAttribution.get()
      : { code: "", platform: "" };
    if (stored.code) {
      return stored;
    }
    var params = new URLSearchParams(window.location.search);
    return {
      code: params.get("ref") || "",
      platform: params.get("platform") || "",
    };
  }

  function collectFtvAnswerJson() {
    try {
      if (typeof window.buildPayload === "function") {
        const payload = window.buildPayload();
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          return payload;
        }
      }
    } catch (error) {
      console.warn("FTV buildPayload unavailable:", error);
    }
    return undefined;
  }

  function collectTerminationPayload() {
    if (typeof window.__concaveCollectTerminations === "function") {
      const collected = window.__concaveCollectTerminations();
      if (Array.isArray(collected) && collected.length > 0) {
        if (typeof collected[0] === "string") {
          return collected.map(function (ruleKey) {
            return {
              ruleKey: ruleKey,
              ruleLabel: ruleKey,
              reasonText: ruleKey,
            };
          });
        }
        return collected;
      }
    }
    var reasons = window.__termReasons || [];
    return reasons.map(function (ruleKey) {
      return {
        ruleKey: ruleKey,
        ruleLabel: ruleKey,
        reasonText: ruleKey,
      };
    });
  }

  async function resolveDeviceFingerprint() {
    if (
      !window.ConcaveDeviceFingerprint ||
      typeof window.ConcaveDeviceFingerprint.get !== "function"
    ) {
      return null;
    }
    try {
      return await Promise.race([
        window.ConcaveDeviceFingerprint.get(),
        new Promise(function (resolve) {
          window.setTimeout(function () {
            resolve(null);
          }, 400);
        }),
      ]);
    } catch (error) {
      console.warn("Device fingerprint unavailable:", error);
      return null;
    }
  }

  function showThankYouCtaLoading() {
    const screen = getVisibleScreen();
    const host = getResultHost(screen);
    if (host && !isTerminateScreen(screen)) {
      restoreLegacyResultCopy(host);
    }

    const referEarn = getReferEarnContainer(screen);
    if (referEarn) {
      referEarn.classList.add("hidden");
      referEarn.innerHTML = "";
    }

    const container = getCtaContainer(screen);
    if (!container) return;
    container.classList.remove("hidden");
    container.innerHTML = "";

    const fullName = document.querySelector("[name=name]")?.value?.trim() || "";
    const mobile = document.querySelector("[name=phone]")?.value?.trim() || "";

    container.appendChild(
      createThankYouButton(
        "DM us on WhatsApp",
        "Message the study team",
        "cta-wa",
        function () {
          window.open(
            buildWhatsAppVerificationUrl(
              buildLoginDetailsWhatsAppMessage({
                fullName: fullName,
                mobile: mobile,
                leadId: "",
              }),
            ),
            "_blank",
            "noopener,noreferrer",
          );
        },
      ),
    );

    const shareButton = createThankYouButton(
      "Share",
      "Invite your friends",
      "cta-ref",
      function () {},
    );
    shareButton.disabled = true;
    shareButton.setAttribute("aria-busy", "true");
    shareButton.style.opacity = "0.65";
    container.appendChild(shareButton);
  }

  async function submitRegistration(referrerRef, submitOptions) {
    if (submitRegistration.submitted) return false;

    const visibleScreen = document.querySelector(".screen:not(.hidden)");
    if (visibleScreen) recordScreenFieldTimes(visibleScreen);

    const fullName = document.querySelector("[name=name]")?.value?.trim() || "";
    const mobile = document.querySelector("[name=phone]")?.value?.trim() || "";
    let city = document.querySelector("[name=city]")?.value?.trim() || "";
    const email = document.querySelector("[name=email]")?.value?.trim() || "";
    const area = document.querySelector("[name=area]")?.value?.trim() || "";
    const pincode = document.querySelector("[name=zip]")?.value?.trim() || "";
    const dob = buildDobIso();
    let ageBand = readAgeBand();

    if (!city || !ageBand) {
      const payload = collectFtvAnswerJson();
      const profile =
        payload && payload.profile && typeof payload.profile === "object"
          ? payload.profile
          : null;
      if (!city && profile && profile.city) {
        city = String(profile.city).trim();
      }
      if (!ageBand && profile) {
        ageBand = String(profile.age_band || profile.age_today || "").trim();
      }
    }

    syncTerminationState();
    const isTerminated =
      Boolean(window.__terminated) ||
      collectTerminationPayload().length > 0 ||
      Boolean(submitOptions && submitOptions.forceTerminated);

    if (!isTerminated && (!city || !ageBand)) {
      showRegistrationError(
        "Please complete your city and age before submitting.",
      );
      return false;
    }

    if (!isTerminated && (!fullName || fullName.length < 2)) {
      showRegistrationError("Please enter your full name before submitting.");
      return false;
    }

    if (!isTerminated && !mobile) {
      showRegistrationError(
        "Please enter your mobile number before submitting.",
      );
      return false;
    }

    submitRegistration.submitted = true;
    showThankYouCtaLoading();
    const fingerprintPromise = resolveDeviceFingerprint();

    try {
      const submittedAt = new Date().toISOString();
      const tracking = collectSubmissionAnalytics();
      const acquisition = collectAcquisition();
      var attribution = getReferrerAttribution();
      var referralPlatform = attribution.platform || "";
      var deviceFingerprint = await fingerprintPromise;
      const terminationPayload = (function () {
        const collected = collectTerminationPayload();
        if (collected.length > 0) return collected;
        if (submitOptions && submitOptions.forceTerminated) {
          return [
            {
              ruleKey: "TERMINATE_AGE_OUT_OF_RANGE",
              ruleLabel: "Age out of range",
              reasonText: "Age out of range",
            },
          ];
        }
        return [];
      })();
      var response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName || undefined,
          mobile: mobile || undefined,
          dob: dob || undefined,
          age_band: ageBand || undefined,
          city: city || undefined,
          email: email || undefined,
          area: area || undefined,
          pincode: pincode || undefined,
          referrerCode: referrerRef || attribution.code || undefined,
          referralPlatform: referralPlatform || undefined,
          acquisitionSource: acquisition.source || undefined,
          otherSource: acquisition.other || undefined,
          answers: collectScreenerAnswers(),
          answerJson: collectFtvAnswerJson(),
          responseTimes: tracking.responseTimes,
          analytics: tracking.analytics || undefined,
          startedAt: tracking.startedAt,
          submittedAt: tracking.submittedAt || submittedAt,
          currentScreen: tracking.currentScreen || undefined,
          lastScreen: tracking.lastScreen || undefined,
          terminated: isTerminated,
          terminations: terminationPayload,
          deviceFingerprint: deviceFingerprint || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        submitRegistration.submitted = false;
        const referEarn = getReferEarnContainer(getVisibleScreen());
        if (referEarn) {
          referEarn.classList.add("hidden");
          referEarn.innerHTML = "";
        }
        if (data.code === "DUPLICATE_MOBILE") {
          showAlreadyRegisteredDialog(mobile);
          return false;
        }
        if (
          !submitOptions?.retriedAsTerminated &&
          (data.code === "AGE_OUT_OF_RANGE" || isTerminated)
        ) {
          return submitRegistration(referrerRef, {
            ...(submitOptions || {}),
            retriedAsTerminated: true,
            forceTerminated: true,
          });
        }
        if (isTerminated) {
          console.warn(
            "[ConcaveRegistrationBridge] terminated registration failed:",
            data.error || response.status,
          );
          showRegistrationError(
            data.error || "Could not save this response. Please try again.",
          );
          return false;
        }
        showRegistrationError(
          data.error || "Registration failed. Please try again.",
        );
        return false;
      }

      if (submitOptions && typeof submitOptions.revealResult === "function") {
        submitOptions.revealResult();
      }

      clearRegistrationDraft(mobile);

      // Registration establishes a short session so thank-you UPI can save.
      await completeRegistrationOnForm(data, submitOptions);
      return true;
    } catch (err) {
      submitRegistration.submitted = false;
      const referEarn = getReferEarnContainer(getVisibleScreen());
      if (referEarn) {
        referEarn.classList.add("hidden");
        referEarn.innerHTML = "";
      }
      const detail = err && err.message ? ` (${err.message})` : "";
      showRegistrationError(
        "Could not reach the server. Please try again." + detail,
      );
      console.error("Registration submit failed:", err);
      return false;
    }
  }

  submitRegistration.submitted = false;
  submitRegistration.startedAt = new Date().toISOString();

  let lastCheckedMobile = "";

  function normalizeMobile(value) {
    return String(value || "").replace(/\D/g, "");
  }

  async function checkParticipantMobileExists(mobile) {
    try {
      const response = await fetch(
        "/api/participant/check-mobile?mobile=" + encodeURIComponent(mobile),
      );
      if (!response.ok) return false;

      const data = await response.json().catch(function () {
        return {};
      });
      return Boolean(data.exists);
    } catch (error) {
      console.warn("Mobile existence check failed:", error);
      return false;
    }
  }

  async function checkMobileExistsAndPrompt(sourceInput) {
    if (submitRegistration.submitted) return;
    if (window.__concaveRefillMode) return;

    const rawMobile =
      (sourceInput && sourceInput.value) ||
      document.getElementById("fPhone")?.value ||
      document.querySelector('[name="phone"]:not([type="hidden"])')?.value ||
      document.querySelector("[name=phone]")?.value ||
      "";
    const mobile = normalizeMobile(rawMobile);

    if (mobile.length < 10) return;
    if (mobile === lastCheckedMobile) return;
    lastCheckedMobile = mobile;

    if (await checkParticipantMobileExists(mobile)) {
      showAlreadyRegisteredDialog(rawMobile.trim());
    }
  }

  function bindMobileExistenceCheck(input) {
    if (!input || input.dataset.existenceCheckBound === "1") return;
    if (String(input.type || "").toLowerCase() === "hidden") return;
    input.dataset.existenceCheckBound = "1";

    function runCheck() {
      void checkMobileExistsAndPrompt(input);
    }

    input.addEventListener("blur", runCheck);
    input.addEventListener("change", runCheck);
    input.addEventListener("input", function () {
      const mobile = normalizeMobile(input.value || "");
      if (mobile.length >= 10) runCheck();
    });
  }

  function scanMobileExistenceInputs() {
    ["#fPhone", 'input[name="phone"]', '[data-rl-field="mobile"]'].forEach(
      function (selector) {
        document.querySelectorAll(selector).forEach(function (input) {
          bindMobileExistenceCheck(input);
        });
      },
    );
  }

  function installReferralLeadMobileCheck(panel) {
    const phone = panel.querySelector('[data-rl-field="mobile"]');
    if (!phone || phone.dataset.existenceCheckBound === "1") return;
    phone.dataset.existenceCheckBound = "1";

    let lastChecked = "";

    function runCheck() {
      const rawMobile = phone.value || "";
      const mobile = normalizeReferralLeadMobile(rawMobile);
      if (mobile.length < 10) return;
      if (mobile === lastChecked) return;
      lastChecked = mobile;
      void checkParticipantMobileExists(mobile).then(function (exists) {
        if (exists) showAlreadyRegisteredDialog(rawMobile.trim());
      });
    }

    phone.addEventListener("blur", runCheck);
    phone.addEventListener("change", runCheck);
  }

  function installDobDateConstraints() {
    document
      .querySelectorAll('[name="dob_date"], [data-rl-field="dob"]')
      .forEach(function (input) {
        configureDobDateInput(input);
      });

    if (installDobDateConstraints.observer) return;

    const observer = new MutationObserver(function () {
      document
        .querySelectorAll('[name="dob_date"], [data-rl-field="dob"]')
        .forEach(function (input) {
          configureDobDateInput(input);
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    installDobDateConstraints.observer = observer;
  }

  function installMobileExistenceCheck() {
    scanMobileExistenceInputs();

    if (installMobileExistenceCheck.observer) return;

    const observer = new MutationObserver(function () {
      scanMobileExistenceInputs();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    installMobileExistenceCheck.observer = observer;
  }

  function disableCapacityCityBlock() {
    var cfg = window.__concaveStudyConfig;
    if (cfg && cfg.enforce_capacity === true) return;

    function clearBlock() {
      if (window.A) window.A._cityBlocked = false;
      var err = document.getElementById("fCityErr");
      if (
        err &&
        /no longer accepting|not accepting responses|reached its respondent/i.test(
          err.textContent || "",
        )
      ) {
        err.hidden = true;
        err.textContent = "";
      }
      var input = document.getElementById("fCity");
      if (input) input.classList.remove("invalid");
    }

    clearBlock();
    document.addEventListener("focusout", function (event) {
      if (event.target && event.target.id === "fCity") {
        setTimeout(clearBlock, 50);
      }
    });

    if (window.__concaveCapacityFetchPatched) return;
    window.__concaveCapacityFetchPatched = true;
    var origFetch = window.fetch;
    if (typeof origFetch !== "function") return;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      return origFetch.apply(this, arguments).then(function (res) {
        if (String(url).indexOf("/api/cities/check") === -1) return res;
        return res
          .clone()
          .json()
          .then(function (data) {
            var code = data && data.code;
            if (
              data &&
              data.ok === false &&
              (code === "city_full" ||
                code === "cell_full" ||
                code === "state_full" ||
                code === "study_full")
            ) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  closed: false,
                  matchType: data.matchType,
                }),
                { headers: { "Content-Type": "application/json" } },
              );
            }
            return res;
          })
          .catch(function () {
            return res;
          });
      });
    };
  }

  window.ConcaveRegistrationBridge = {
    collectScreenerAnswers,
    collectResponseTimes,
    collectSubmissionAnalytics,
    resolveDeviceFingerprint,
    validateDobValue,
    configureDobDateInput,
    attach(showResultFn) {
      ensureReferEarnStyles();
      ensureResultInfrastructure();
      installQuestionTiming();
      installRegistrationDraft();
      startSurveyAnalytics();
      if (
        window.ConcaveDeviceFingerprint &&
        typeof window.ConcaveDeviceFingerprint.prime === "function"
      ) {
        window.ConcaveDeviceFingerprint.prime();
      }
      installMobileExistenceCheck();
      installDobDateConstraints();
      disableCapacityCityBlock();
      installConsentReferInterceptor(
        showResultFn,
        getReferrerAttribution().code || "",
      );

      const referrerRef = getReferrerAttribution().code || "";

      return function wrappedShowResult(id) {
        if (window.__concaveConsentPoliteComplete) return;

        const visibleScreen = document.querySelector(".screen:not(.hidden)");
        if (visibleScreen) recordScreenFieldTimes(visibleScreen);
        if (draftAutosave && typeof draftAutosave.saveNow === "function") {
          draftAutosave.saveNow();
        }

        if (
          isConsentNoSelected() &&
          isConsentScreenVisible() &&
          (id === "s-terminate" || id === "s-thankyou")
        ) {
          handleConsentDeclined(function () {
            showReferralLeadCaptureForm(referrerRef);
          });
          return;
        }

        if (window.__concaveRefillMode) {
          showResultFn(id);
          return;
        }
        if (!isResultScreen(id)) {
          showResultFn(id);
          return;
        }
        if (window.__concaveConsentReferrerOnly) {
          showResultFn(id);
          return;
        }

        void submitRegistration(referrerRef, {
          revealResult: function () {
            showResultFn(id);
            const screen = getResultScreenById(id);
            if (screen) {
              ensureResultMountPoints(getResultHost(screen));
              if (isTerminateScreen(screen)) {
                applyTerminatedResultPresentation(screen);
              }
            }
          },
        });
      };
    },
  };
})();
