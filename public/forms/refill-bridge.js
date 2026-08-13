(function () {
  "use strict";

  // Signals to the registration bridge that we are editing an existing
  // participant, so the "already registered" duplicate prompt is suppressed.
  window.__concaveRefillMode = true;

  const CORE_FIELDS = new Set([
    "name",
    "phone",
    "city",
    "city_id",
    "email",
    "area",
    "zip",
    "dob_date",
    "dob_month",
    "dob_day",
    "dob_year",
  ]);

  function setFieldValue(name, value) {
    if (!value) return;
    const fields = document.querySelectorAll(
      '[name="' + CSS.escape(name) + '"]',
    );
    if (!fields.length) return;

    const first = fields[0];
    if (first.type === "radio" || first.type === "checkbox") {
      fields.forEach(function (field) {
        if (field.value === value) field.checked = true;
      });
      return;
    }

    first.value = value;
  }

  function setDobFields(dob) {
    if (!dob) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setFieldValue("dob_date", dob);
      const parts = dob.split("-");
      setFieldValue("dob_year", parts[0]);
      setFieldValue("dob_month", String(parseInt(parts[1], 10)));
      setFieldValue("dob_day", String(parseInt(parts[2], 10)));
    }
  }

  function lockPhoneFields() {
    var phoneFields = document.querySelectorAll('[name="phone"]');
    phoneFields.forEach(function (field) {
      field.setAttribute("readonly", "readonly");
      field.setAttribute("aria-readonly", "true");
      field.style.backgroundColor = "#F3F0F4";
      field.style.cursor = "not-allowed";
      field.addEventListener("keydown", function (event) {
        event.preventDefault();
      });
      field.addEventListener("paste", function (event) {
        event.preventDefault();
      });
    });
  }

  function applyCoreFieldsFromDraftFields(fields) {
    if (!fields || typeof fields !== "object") return;
    CORE_FIELDS.forEach(function (name) {
      if (name === "phone") return;
      const value = fields[name];
      if (value === undefined || value === null || value === "") return;
      if (name.startsWith("dob_")) return;
      setFieldAnswers(name, value);
    });
    if (fields.dob_date) {
      setDobFields(fields.dob_date);
    } else if (fields.dob_year && fields.dob_month && fields.dob_day) {
      setDobFields(
        String(fields.dob_year) +
          "-" +
          String(fields.dob_month).padStart(2, "0") +
          "-" +
          String(fields.dob_day).padStart(2, "0"),
      );
    }
  }

  function applyBasicInfoPrefill(data) {
    setFieldValue("name", data.fullName);
    setFieldValue("phone", data.mobile);
    if (data.city_id) {
      setFieldValue("city_id", data.city_id);
    } else {
      setFieldValue("city", data.city);
    }
    setFieldValue("email", data.email);
    setFieldValue("area", data.area);
    setFieldValue("zip", data.pincode || data.zip);
    setDobFields(data.dob);
    lockPhoneFields();
  }

  function invertFieldQKeyMap() {
    const map =
      (window.ConcaveFieldQKeyMap &&
        typeof window.ConcaveFieldQKeyMap.resolveMap === "function" &&
        window.ConcaveFieldQKeyMap.resolveMap()) ||
      window.__concaveFieldQKeyMap ||
      {};
    const inverted = {};
    Object.keys(map).forEach(function (fieldName) {
      inverted[map[fieldName]] = fieldName;
    });
    return inverted;
  }

  function setFieldAnswers(name, value) {
    if (!name) return;
    if (Array.isArray(value)) {
      const fields = document.querySelectorAll(
        '[name="' + CSS.escape(name) + '"]',
      );
      fields.forEach(function (field) {
        if (field.type === "checkbox") {
          field.checked = value.includes(field.value);
        }
      });
      return;
    }
    if (value && typeof value === "object") return;
    setFieldValue(name, String(value ?? ""));
  }

  function setAnswers(answers) {
    if (!answers || typeof answers !== "object") return;
    const qToField = invertFieldQKeyMap();

    Object.entries(answers).forEach(function ([key, value]) {
      const fieldName = qToField[key] || key;
      setFieldAnswers(fieldName, value);
    });
  }

  function buildDobIso() {
    const single = document.querySelector("[name=dob_date]")?.value;
    if (single) return single;

    const month = document.querySelector("[name=dob_month]")?.value;
    const day = document.querySelector("[name=dob_day]")?.value;
    const year = document.querySelector("[name=dob_year]")?.value;
    if (!month || !day || !year) return "";
    return (
      year +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0")
    );
  }

  function collectScreenerAnswers() {
    if (window.ConcaveRegistrationBridge?.collectScreenerAnswers) {
      return window.ConcaveRegistrationBridge.collectScreenerAnswers();
    }

    const answers = {};
    document
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach(function (el) {
        if (CORE_FIELDS.has(el.name) || el.name.startsWith("dob_")) return;
        if (el.type === "hidden" || el.type === "submit" || el.type === "button") {
          return;
        }
        const value = String(el.value || "").trim();
        if (value) answers[el.name] = value;
      });
    return answers;
  }

  function collectResponseTimes() {
    if (window.ConcaveRegistrationBridge?.collectResponseTimes) {
      return window.ConcaveRegistrationBridge.collectResponseTimes();
    }
    return {};
  }

  function collectSubmissionAnalytics() {
    if (window.ConcaveRegistrationBridge?.collectSubmissionAnalytics) {
      return window.ConcaveRegistrationBridge.collectSubmissionAnalytics();
    }

    return {
      analytics: null,
      responseTimes: collectResponseTimes(),
      startedAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
    };
  }

  async function prefillForm() {
    const response = await fetch("/api/participant/refill-context", {
      credentials: "include",
    });
    if (!response.ok) return;

    const data = await response.json();
    applyBasicInfoPrefill(data);

    if (window.ConcaveFormDraft && data.mobile) {
      const draft = window.ConcaveFormDraft.load("registration", data.mobile);
      if (draft && draft.fields) {
        applyCoreFieldsFromDraftFields(draft.fields);
      }
      if (typeof window.ConcaveFormDraft.clear === "function") {
        // Drop saved screener progress — only basic info should persist on refill.
        window.ConcaveFormDraft.clear("registration", data.mobile);
      }
    }

    requestAnimationFrame(function () {
      applyBasicInfoPrefill(data);
    });

    // Screener answers are cleared on admin refill request — do not prefill.
  }

  async function submitRefill() {
    const fullName = document.querySelector("[name=name]")?.value?.trim() || "";
    // Always send the locked phone field value; server ignores changes anyway.
    const mobile = document.querySelector("[name=phone]")?.value?.trim() || "";
    const citySelect = document.querySelector("[name=city_id]");
    const cityId = citySelect?.value?.trim() || "";
    const cityName =
      citySelect?.options?.[citySelect.selectedIndex]?.text?.trim() ||
      document.querySelector("[name=city]")?.value?.trim() ||
      "";
    const email = document.querySelector("[name=email]")?.value?.trim() || "";
    const area = document.querySelector("[name=area]")?.value?.trim() || "";
    const pincode = document.querySelector("[name=zip]")?.value?.trim() || "";
    const dob = buildDobIso();
    if (!fullName || !mobile || !(cityId || cityName) || !dob) return false;

    const tracking = collectSubmissionAnalytics();
    var deviceFingerprint = null;
    if (window.ConcaveRegistrationBridge?.resolveDeviceFingerprint) {
      deviceFingerprint =
        await window.ConcaveRegistrationBridge.resolveDeviceFingerprint();
    } else if (
      window.ConcaveDeviceFingerprint &&
      typeof window.ConcaveDeviceFingerprint.get === "function"
    ) {
      try {
        deviceFingerprint = await window.ConcaveDeviceFingerprint.get();
      } catch (error) {
        deviceFingerprint = null;
      }
    }
    const response = await fetch("/api/participant/refill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fullName,
        mobile,
        dob,
        city_id: cityId || undefined,
        city: cityName || undefined,
        email: email || undefined,
        area: area || undefined,
        pincode: pincode || undefined,
        answers: collectScreenerAnswers(),
        responseTimes: tracking.responseTimes,
        analytics: tracking.analytics || undefined,
        startedAt: tracking.startedAt,
        submittedAt: tracking.submittedAt,
        deviceFingerprint: deviceFingerprint || undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(function () {
        return {};
      });
      showRefillError(
        data.error || "Could not update your registration. Please try again.",
      );
      return false;
    }

    return true;
  }

  function showRefillError(message) {
    const existing = document.getElementById("refill-error");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "refill-error";
    banner.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:#FDECEC;color:#8B1E1E;border:1px solid #F5B7B1;border-radius:12px;padding:14px 16px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.12)";
    banner.textContent = message;
    document.body.appendChild(banner);
  }

  function attachRefillSubmit() {
    if (!window.ConcaveRegistrationBridge) return;

    const originalAttach = window.ConcaveRegistrationBridge.attach;
    window.ConcaveRegistrationBridge.attach = function (showResultFn) {
      const wrapped = originalAttach(showResultFn);
      return function refillWrappedShowResult(id) {
        wrapped(id);

        if (id === "s-thankyou") {
          void submitRefill();
          return;
        }

        // A refilled screener may now route to terminate. We still persist the
        // updated data and clear the refill flag so the participant is not
        // stuck in a refill loop. Mirrors the registration consent gate.
        if (id === "s-terminate") {
          const consent = document.querySelector(
            'input[name="consent"]:checked',
          )?.value;
          if (consent === "Yes") void submitRefill();
        }
      };
    };
  }

  // Wrap attach SYNCHRONOUSLY at load time. The form's inline script calls
  // `ConcaveRegistrationBridge.attach(showResult)` synchronously (right after
  // showScreen(0)). Head scripts run in order before that, so registration
  // -bridge.js has already defined the global here. Wrapping inside an async
  // prefill .then() would run too late — attach would already be called and
  // the refill submit handler would never be wired, leaving refill_required
  // set and trapping the participant in a refill loop.
  attachRefillSubmit();

  function startPrefill() {
    if (
      window.ConcaveDeviceFingerprint &&
      typeof window.ConcaveDeviceFingerprint.prime === "function"
    ) {
      window.ConcaveDeviceFingerprint.prime();
    }
    void prefillForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startPrefill);
  } else {
    startPrefill();
  }
})();
