import { createClient } from "@supabase/supabase-js";

const EMAIL = (process.env.ADMIN_SEED_EMAIL ?? "admin@voter.local").trim().toLowerCase();
const PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "Admin@Voter2026";
const NAME = process.env.ADMIN_SEED_NAME ?? "Super Admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

if (PASSWORD.length < 8) {
  console.error("Admin password must be at least 8 characters.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  let authUser = await findAuthUserByEmail(EMAIL);

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Failed to create auth user.");
    }
    authUser = data.user;
    console.log("Created Auth user:", authUser.id);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    console.log("Updated Auth password for:", authUser.id);
  }

  const { data: existingAdmin, error: lookupError } = await supabase
    .from("admin_users")
    .select("id, email, role, status")
    .eq("email", EMAIL)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existingAdmin) {
    const { error } = await supabase
      .from("admin_users")
      .update({
        auth_user_id: authUser.id,
        name: NAME,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      })
      .eq("id", existingAdmin.id);
    if (error) throw error;
    console.log("Updated admin_users row:", existingAdmin.id);
  } else {
    const { data, error } = await supabase
      .from("admin_users")
      .insert({
        auth_user_id: authUser.id,
        name: NAME,
        email: EMAIL,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (error) throw error;
    console.log("Inserted admin_users row:", data.id);
  }

  console.log("\nAdmin panel login");
  console.log("  URL:      http://localhost:3000/admin/login");
  console.log("  Email:   ", EMAIL);
  console.log("  Password:", PASSWORD);
  console.log("  Role:     SUPER_ADMIN");
}

main().catch((error) => {
  console.error("Seed failed:", error.message ?? error);
  process.exit(1);
});
