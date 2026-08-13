import { NextRequest, NextResponse } from "next/server";

import { completeAdminLogin } from "@/lib/auth/admin-session";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const admin = await completeAdminLogin(data.user.id);
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "This account is not authorized for admin access or is inactive.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("POST /api/admin/login failed:", error);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 },
    );
  }
}
