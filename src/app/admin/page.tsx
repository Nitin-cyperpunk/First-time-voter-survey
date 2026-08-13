import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/auth/admin-session";

export default async function AdminIndexPage() {
  const admin = await getCurrentAdmin();
  redirect(admin ? "/metrics" : "/admin/login");
}
