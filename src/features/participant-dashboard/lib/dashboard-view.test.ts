import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDashboardView } from "@/features/participant-dashboard/lib/dashboard-view";
import type { ParticipantDashboardData } from "@/features/participant-dashboard/types";

function data(
  overrides: Partial<ParticipantDashboardData>,
): ParticipantDashboardData {
  return {
    fullName: "Test",
    referralLink: "https://example.com/r/ABC",
    status: "completed",
    displayStatus: "Form completed",
    screenerSubmitted: true,
    surveySubmitted: true,
    canSubmitSurvey: false,
    showReferral: true,
    upiRequired: false,
    mobile: "9999999999",
    leadId: "CI_FTV_0001",
    upiId: null,
    referralStats: {
      referredCount: 2,
      qualifiedCount: 1,
      totalEarned: 50,
    },
    referralRewardAmount: 50,
    ...overrides,
  };
}

test("completed users stay on survey_completed even if UPI is required", () => {
  assert.equal(
    resolveDashboardView(data({ status: "completed", upiRequired: true })),
    "survey_completed",
  );
});

test("successful without UPI still shows the completed dashboard with counts", () => {
  assert.equal(
    resolveDashboardView(data({ status: "successful", upiRequired: true })),
    "survey_completed",
  );
});

test("terminated users keep the not-eligible dashboard", () => {
  assert.equal(
    resolveDashboardView(data({ status: "terminated", upiRequired: false })),
    "terminated",
  );
});
