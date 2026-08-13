import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type ReferralLeadRow = Database["public"]["Tables"]["referral_leads"]["Row"];
type ReferralLeadInsert =
  Database["public"]["Tables"]["referral_leads"]["Insert"];

export type ReferralLeadRecord = {
  id: string;
  fullName: string;
  mobile: string;
  city: string;
  area: string | null;
  pincode: string | null;
  dob: string;
  referralCode: string;
  referredBy: string | null;
  shareCount: number;
  whatsappSharedAt: string | null;
  instagramSharedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function mapReferralLead(row: ReferralLeadRow): ReferralLeadRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    mobile: row.mobile,
    city: row.city,
    area: row.area,
    pincode: row.pincode,
    dob: row.dob,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    shareCount: row.share_count,
    whatsappSharedAt: row.whatsapp_shared_at,
    instagramSharedAt: row.instagram_shared_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findReferralLeadByMobile(mobile: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("referral_leads")
    .select("*")
    .eq("mobile", mobile)
    .maybeSingle();

  if (error) throw error;
  return data ? mapReferralLead(data) : null;
}

export async function findReferralLeadByCode(referralCode: string) {
  const normalized = referralCode.trim().toUpperCase();
  const { data, error } = await getSupabaseAdmin()
    .from("referral_leads")
    .select("*")
    .eq("referral_code", normalized)
    .maybeSingle();

  if (error) throw error;
  return data ? mapReferralLead(data) : null;
}

export async function referralLeadCodeExists(referralCode: string) {
  const existing = await findReferralLeadByCode(referralCode);
  return Boolean(existing);
}

export async function insertReferralLead(input: ReferralLeadInsert) {
  const { data, error } = await getSupabaseAdmin()
    .from("referral_leads")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return mapReferralLead(data);
}

export async function markReferralLeadShared(
  referralCode: string,
  platform: "whatsapp" | "instagram" | "copy",
) {
  const existing = await findReferralLeadByCode(referralCode);
  if (!existing) return null;

  const now = new Date().toISOString();
  const patch =
    platform === "whatsapp"
      ? {
          share_count: existing.shareCount + 1,
          whatsapp_shared_at: existing.whatsappSharedAt ?? now,
        }
      : platform === "instagram"
        ? {
            share_count: existing.shareCount + 1,
            instagram_shared_at: existing.instagramSharedAt ?? now,
          }
        : {
            share_count: existing.shareCount + 1,
          };

  const { data, error } = await getSupabaseAdmin()
    .from("referral_leads")
    .update(patch)
    .eq("referral_code", existing.referralCode)
    .select("*")
    .single();

  if (error) throw error;
  return mapReferralLead(data);
}
