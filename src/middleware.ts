import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isCoarseAdminProtectedPath } from "@/lib/auth/admin-routes";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isCoarseAdminProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/metrics/:path*",
    "/respondents/:path*",
    "/dm-verify/:path*",
    "/terminations/:path*",
    "/referrals/:path*",
    "/forms",
    "/message-templates/:path*",
    "/payouts/:path*",
    "/settings/:path*",
    "/admin/users/:path*",
    "/admin",
    "/api/admin/:path*",
  ],
};
