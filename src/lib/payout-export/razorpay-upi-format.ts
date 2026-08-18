import { isValidUpiId, normalizeUpiId } from "@/lib/upi";

/** Exact RazorpayX UPI-with-bene-details template headers (order matters). */
export const RAZORPAY_UPI_HEADERS = [
  "Beneficiary Name (Mandatory)",
  "Beneficiary's UPI ID (Mandatory)",
  "Payout Amount (Mandatory)",
  "Payout Narration (Optional)",
  "Notes (Optional)",
  "Phone Number (Optional)",
  "Email ID (Optional)",
  "Contact Reference ID (Optional)",
  "Payout Reference ID (Optional)",
] as const;

export type RazorpayUpiHeader = (typeof RAZORPAY_UPI_HEADERS)[number];

export type RazorpayUpiExportRow = Record<RazorpayUpiHeader, string | number>;

export type PayoutExportSourceRow = {
  leadId: string;
  fullName: string;
  mobile: string;
  email?: string | null;
  upiId: string | null;
  amount: number;
  surveyName?: string | null;
  referralsName?: string | null;
  referralCount?: number;
  payoutReferenceId?: string | null;
};

export type PayoutExportExcludeReason =
  | "missing_upi"
  | "invalid_upi"
  | "invalid_amount"
  | "invalid_name";

export const PAYOUT_READINESS_HEADER = "Payout readiness" as const;
export const REFERRAL_COUNT_HEADER = "Earned referral count" as const;

export type PayoutExportRow = RazorpayUpiExportRow & {
  [PAYOUT_READINESS_HEADER]: string;
  [REFERRAL_COUNT_HEADER]?: number | "";
};

export type PayoutExportSummary = {
  total: number;
  ready: number;
  missingUpi: number;
  invalidUpi: number;
  invalidAmount: number;
  invalidName: number;
};

export type ClassifiedPayoutExport = {
  payable: RazorpayUpiExportRow[];
  excluded: Array<{
    leadId: string;
    fullName: string;
    upiId: string;
    amount: number;
    reason: PayoutExportExcludeReason;
  }>;
};

/** Per-column input/error prompts matching RazorpayX UPI template guidance. */
export const RAZORPAY_UPI_COLUMN_VALIDATIONS: Array<{
  header: RazorpayUpiHeader;
  col: string;
  type: "textLength" | "whole" | "custom";
  operator?: "lessThanOrEqual" | "between" | "greaterThanOrEqual";
  formula1?: string;
  formula2?: string;
  allowBlank: boolean;
  promptTitle: string;
  prompt: string;
  errorTitle: string;
  error: string;
}> = [
  {
    header: "Beneficiary Name (Mandatory)",
    col: "A",
    type: "custom",
    formula1: 'AND(LEN(A2)>=1,LEN(A2)<=100,ISERROR(FIND("@",A2)))',
    allowBlank: false,
    promptTitle: "Beneficiary Name",
    prompt:
      "Mandatory. A-Z a-z 0-9 and spaces only. No special characters.",
    errorTitle: "Invalid Beneficiary Name",
    error: "Enter a name using only letters, numbers, and spaces.",
  },
  {
    header: "Beneficiary's UPI ID (Mandatory)",
    col: "B",
    type: "custom",
    formula1: 'AND(ISNUMBER(FIND("@",B2)),LEN(B2)>=5,LEN(B2)<=320)',
    allowBlank: true,
    promptTitle: "Beneficiary's UPI ID",
    prompt:
      "Required for payout. Format name@bank (e.g. sample@okhdfc). Leave blank if filling manually.",
    errorTitle: "Invalid UPI ID",
    error: "Enter a valid UPI ID like name@bank, or leave blank to fill later.",
  },
  {
    header: "Payout Amount (Mandatory)",
    col: "C",
    type: "whole",
    operator: "between",
    formula1: "1",
    formula2: "100000",
    allowBlank: false,
    promptTitle: "Payout Amount",
    prompt: "Mandatory. Amount in rupees from Rs 1 to Rs 1,00,000.",
    errorTitle: "Invalid Amount",
    error: "Enter a whole-rupee amount between 1 and 100000.",
  },
  {
    header: "Payout Narration (Optional)",
    col: "D",
    type: "textLength",
    operator: "lessThanOrEqual",
    formula1: "30",
    allowBlank: true,
    promptTitle: "Payout Narration",
    prompt: "Optional. Max 30 characters. No special characters.",
    errorTitle: "Invalid Narration",
    error: "Narration must be at most 30 characters without special chars.",
  },
  {
    header: "Notes (Optional)",
    col: "E",
    type: "textLength",
    operator: "lessThanOrEqual",
    formula1: "200",
    allowBlank: true,
    promptTitle: "Notes",
    prompt: "Optional. Internal notes (referrals names).",
    errorTitle: "Invalid Notes",
    error: "Notes must be at most 200 characters.",
  },
  {
    header: "Phone Number (Optional)",
    col: "F",
    type: "textLength",
    operator: "lessThanOrEqual",
    formula1: "13",
    allowBlank: true,
    promptTitle: "Phone Number",
    prompt: "Optional. 10-digit mobile, or +91XXXXXXXXXX (max 13 chars).",
    errorTitle: "Invalid Phone",
    error: "Phone must be 10 digits or +91 plus 10 digits (max 13).",
  },
  {
    header: "Email ID (Optional)",
    col: "G",
    type: "custom",
    formula1: 'OR(G2="",AND(ISNUMBER(FIND("@",G2)),LEN(G2)<=254))',
    allowBlank: true,
    promptTitle: "Email ID",
    prompt: "Optional. Valid email address.",
    errorTitle: "Invalid Email",
    error: "Enter a valid email or leave blank.",
  },
  {
    header: "Contact Reference ID (Optional)",
    col: "H",
    type: "textLength",
    operator: "lessThanOrEqual",
    formula1: "40",
    allowBlank: true,
    promptTitle: "Contact Reference ID",
    prompt: "Optional. Max 40 characters (lead ID).",
    errorTitle: "Invalid Contact Reference ID",
    error: "Contact Reference ID must be at most 40 characters.",
  },
  {
    header: "Payout Reference ID (Optional)",
    col: "I",
    type: "textLength",
    operator: "lessThanOrEqual",
    formula1: "40",
    allowBlank: true,
    promptTitle: "Payout Reference ID",
    prompt: "Optional. Max 40 characters. Leave blank if none.",
    errorTitle: "Invalid Payout Reference ID",
    error: "Payout Reference ID must be at most 40 characters.",
  },
];

const ALNUM_SPACE = /[^A-Za-z0-9 ]+/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeBeneficiaryName(value: string): string {
  return value.replace(ALNUM_SPACE, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeNarration(value: string): string {
  return value
    .replace(ALNUM_SPACE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

export function sanitizeNotes(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function normalizeExportPhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91${digits.slice(2)}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (trimmed.startsWith("+91") && digits.length === 12) {
    return `+91${digits.slice(2)}`;
  }

  // Prefer a 10-digit tail when longer.
  if (digits.length > 10) {
    const tail = digits.slice(-10);
    return trimmed.startsWith("+") || digits.startsWith("91")
      ? `+91${tail}`
      : tail;
  }

  return digits.slice(0, 13);
}

export function sanitizeEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return EMAIL_PATTERN.test(trimmed) ? trimmed : "";
}

export function sanitizeRefId(value: string, max = 40): string {
  return value.trim().slice(0, max);
}

export function isValidPayoutAmount(amount: number): boolean {
  return (
    Number.isFinite(amount) &&
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= 100_000
  );
}

export function mapPayoutToRazorpayRow(
  row: PayoutExportSourceRow,
): RazorpayUpiExportRow {
  const amount = Math.round(Number(row.amount));
  return {
    "Beneficiary Name (Mandatory)": sanitizeBeneficiaryName(row.fullName),
    "Beneficiary's UPI ID (Mandatory)": row.upiId
      ? normalizeUpiId(row.upiId)
      : "",
    "Payout Amount (Mandatory)": amount,
    "Payout Narration (Optional)": sanitizeNarration(row.surveyName ?? ""),
    "Notes (Optional)": sanitizeNotes(row.referralsName ?? ""),
    "Phone Number (Optional)": normalizeExportPhone(row.mobile ?? ""),
    "Email ID (Optional)": sanitizeEmail(row.email ?? ""),
    "Contact Reference ID (Optional)": sanitizeRefId(row.leadId),
    "Payout Reference ID (Optional)": sanitizeRefId(
      row.payoutReferenceId ?? "",
    ),
  };
}

export function classifyPayoutExportRows(
  rows: PayoutExportSourceRow[],
): ClassifiedPayoutExport {
  const payable: RazorpayUpiExportRow[] = [];
  const excluded: ClassifiedPayoutExport["excluded"] = [];

  for (const row of rows) {
    const name = sanitizeBeneficiaryName(row.fullName);
    const upi = row.upiId?.trim() ?? "";
    const amount = Math.round(Number(row.amount));

    if (!name) {
      excluded.push({
        leadId: row.leadId,
        fullName: row.fullName,
        upiId: upi,
        amount,
        reason: "invalid_name",
      });
      continue;
    }

    if (!upi) {
      excluded.push({
        leadId: row.leadId,
        fullName: row.fullName,
        upiId: "",
        amount,
        reason: "missing_upi",
      });
      continue;
    }

    if (!isValidUpiId(upi)) {
      excluded.push({
        leadId: row.leadId,
        fullName: row.fullName,
        upiId: upi,
        amount,
        reason: "invalid_upi",
      });
      continue;
    }

    if (!isValidPayoutAmount(amount)) {
      excluded.push({
        leadId: row.leadId,
        fullName: row.fullName,
        upiId: upi,
        amount,
        reason: "invalid_amount",
      });
      continue;
    }

    payable.push(mapPayoutToRazorpayRow(row));
  }

  return { payable, excluded };
}

function assessPayoutReadiness(
  row: PayoutExportSourceRow,
): PayoutExportExcludeReason | "ready" {
  const name = sanitizeBeneficiaryName(row.fullName);
  const upi = row.upiId?.trim() ?? "";
  const amount = Math.round(Number(row.amount));

  if (!name) return "invalid_name";
  if (!upi) return "missing_upi";
  if (!isValidUpiId(upi)) return "invalid_upi";
  if (!isValidPayoutAmount(amount)) return "invalid_amount";
  return "ready";
}

/** All rows export — missing UPI stays in the file with an empty UPI cell + readiness flag. */
export function buildPayoutExportRows(rows: PayoutExportSourceRow[]): {
  rows: PayoutExportRow[];
  summary: PayoutExportSummary;
} {
  const summary: PayoutExportSummary = {
    total: rows.length,
    ready: 0,
    missingUpi: 0,
    invalidUpi: 0,
    invalidAmount: 0,
    invalidName: 0,
  };

  const exportRows: PayoutExportRow[] = rows.map((row) => {
    const readiness = assessPayoutReadiness(row);
    switch (readiness) {
      case "ready":
        summary.ready += 1;
        break;
      case "missing_upi":
        summary.missingUpi += 1;
        break;
      case "invalid_upi":
        summary.invalidUpi += 1;
        break;
      case "invalid_amount":
        summary.invalidAmount += 1;
        break;
      case "invalid_name":
        summary.invalidName += 1;
        break;
    }

    const upi = row.upiId?.trim() ?? "";
    const mapped = mapPayoutToRazorpayRow({
      ...row,
      upiId:
        readiness === "missing_upi"
          ? null
          : upi || null,
    });

    return {
      ...mapped,
      [PAYOUT_READINESS_HEADER]:
        readiness === "ready"
          ? "Ready for payout"
          : excludedReasonLabel(readiness),
      ...(row.referralCount !== undefined
        ? { [REFERRAL_COUNT_HEADER]: row.referralCount }
        : {}),
    };
  });

  return { rows: exportRows, summary };
}

export function excludedReasonLabel(reason: PayoutExportExcludeReason): string {
  switch (reason) {
    case "missing_upi":
      return "Missing UPI";
    case "invalid_upi":
      return "Invalid UPI";
    case "invalid_amount":
      return "Amount not in Rs 1–100000";
    case "invalid_name":
      return "Invalid beneficiary name";
    default:
      return reason;
  }
}

export function toExcludedExportRows(
  excluded: ClassifiedPayoutExport["excluded"],
): Array<Record<string, string | number>> {
  return excluded.map((row) => ({
    "Lead ID": row.leadId,
    Name: row.fullName,
    UPI: row.upiId,
    Amount: row.amount,
    Reason: excludedReasonLabel(row.reason),
  }));
}
