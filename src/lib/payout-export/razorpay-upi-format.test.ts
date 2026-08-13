import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RAZORPAY_UPI_HEADERS,
  classifyPayoutExportRows,
  mapPayoutToRazorpayRow,
  normalizeExportPhone,
  sanitizeBeneficiaryName,
  sanitizeNarration,
} from "@/lib/payout-export/razorpay-upi-format";

test("razorpay headers are exactly 9 columns in template order", () => {
  assert.deepEqual([...RAZORPAY_UPI_HEADERS], [
    "Beneficiary Name (Mandatory)",
    "Beneficiary's UPI ID (Mandatory)",
    "Payout Amount (Mandatory)",
    "Payout Narration (Optional)",
    "Notes (Optional)",
    "Phone Number (Optional)",
    "Email ID (Optional)",
    "Contact Reference ID (Optional)",
    "Payout Reference ID (Optional)",
  ]);
});

test("maps a payable row to RazorpayX format", () => {
  const row = mapPayoutToRazorpayRow({
    leadId: "CI_EN_0001",
    fullName: "Its Singh!",
    mobile: "+91 98765 43210",
    email: "its@example.com",
    upiId: "Its.Singh@okhdfc",
    amount: 50,
    surveyName: "Enamor Bra Study 2026 — Wave 1",
    referralsName: "Priya Sharma, Ananya",
    payoutReferenceId: null,
  });

  assert.equal(row["Beneficiary Name (Mandatory)"], "Its Singh");
  assert.equal(row["Beneficiary's UPI ID (Mandatory)"], "its.singh@okhdfc");
  assert.equal(row["Payout Amount (Mandatory)"], 50);
  assert.equal(row["Payout Narration (Optional)"], "Enamor Bra Study 2026 Wave 1");
  assert.equal(row["Notes (Optional)"], "Priya Sharma, Ananya");
  assert.equal(row["Phone Number (Optional)"], "+919876543210");
  assert.equal(row["Email ID (Optional)"], "its@example.com");
  assert.equal(row["Contact Reference ID (Optional)"], "CI_EN_0001");
  assert.equal(row["Payout Reference ID (Optional)"], "");
});

test("classify excludes missing UPI and keeps valid payable", () => {
  const result = classifyPayoutExportRows([
    {
      leadId: "A1",
      fullName: "Valid User",
      mobile: "9876543210",
      email: null,
      upiId: "valid@okhdfc",
      amount: 50,
      surveyName: "Survey",
      referralsName: "Friend",
    },
    {
      leadId: "A2",
      fullName: "No Upi",
      mobile: "9876543211",
      upiId: null,
      amount: 50,
      surveyName: "Survey",
    },
    {
      leadId: "A3",
      fullName: "Zero Amount",
      mobile: "9876543212",
      upiId: "zero@okhdfc",
      amount: 0,
      surveyName: "Survey",
    },
  ]);

  assert.equal(result.payable.length, 1);
  assert.equal(result.excluded.length, 2);
  assert.equal(result.excluded[0]?.reason, "missing_upi");
  assert.equal(result.excluded[1]?.reason, "invalid_amount");
});

test("sanitize helpers enforce Razorpay constraints", () => {
  assert.equal(sanitizeBeneficiaryName("A@B# C"), "A B C");
  assert.equal(sanitizeNarration("x".repeat(40)).length, 30);
  assert.equal(normalizeExportPhone("09876543210"), "9876543210");
});
