import { NextResponse } from "next/server";

import { signOutAdmin } from "@/lib/auth/admin-session";

export async function POST() {
  await signOutAdmin();
  return NextResponse.json({ success: true });
}
