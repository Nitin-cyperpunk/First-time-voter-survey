import { INSTAGRAM_DM_URL } from "@/config/social";
import { formatAdminDate } from "@/lib/format-admin-datetime";

export type PlaceholderDefinition = {
  key: string;
  label: string;
};

export const MESSAGE_TEMPLATE_PLACEHOLDERS: PlaceholderDefinition[] = [
  { key: "participant_name", label: "Participant Name" },
  { key: "mobile", label: "Mobile" },
  { key: "lead_id", label: "Lead ID" },
  { key: "referral_link", label: "Referral Link" },
  { key: "survey_link", label: "Survey Link" },
  { key: "refill_link", label: "Refill Link" },
  { key: "screener_refill_link", label: "Screener Refill Link" },
  { key: "survey_refill_link", label: "Survey Refill Link" },
  { key: "reward_amount", label: "Reward Amount" },
  { key: "qualified_count", label: "Qualified Count" },
  { key: "qualified_referrals", label: "Qualified Referrals" },
  { key: "total_referrals", label: "Total Referrals" },
  { key: "upi", label: "UPI" },
  { key: "upi_amount", label: "UPI Amount" },
  { key: "instagram_url", label: "Instagram URL" },
  { key: "survey_status", label: "Survey Status" },
  { key: "current_date", label: "Current Date" },
  { key: "todays_date", label: "Today's Date" },
];

const previewToday = formatAdminDate(new Date());

export const PREVIEW_MOCK_CONTEXT: Record<string, string> = {
  participant_name: "Priya Sharma",
  mobile: "9820144521",
  lead_id: "CI_FTV_0001",
  referral_link: "https://YOUR_APP_URL/r/FTVABCD12",
  survey_link: "https://YOUR_APP_URL/",
  refill_link: "https://YOUR_APP_URL/refill?t=a1b2c3d4e5f6",
  screener_refill_link: "https://YOUR_APP_URL/refill?t=a1b2c3d4e5f6",
  survey_refill_link: "https://YOUR_APP_URL/",
  reward_amount: "₹225",
  qualified_count: "3",
  qualified_referrals: "3",
  total_referrals: "5",
  upi: "priya@upi",
  upi_amount: "₹150",
  instagram_url: INSTAGRAM_DM_URL,
  survey_status: "Eligible",
  current_date: previewToday,
  todays_date: previewToday,
};
