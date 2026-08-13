import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import {
  listPayouts,
  type PaymentStatus,
} from "@/server/repositories/payouts.repository";

function parsePaymentStatus(value: string | null): PaymentStatus | "all" {
  if (value === "pending" || value === "ready" || value === "paid") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const result = await listPayouts({
      search: searchParams.get("search") ?? undefined,
      paymentStatus: parsePaymentStatus(searchParams.get("status")),
      sortBy:
        (searchParams.get("sortBy") as
          | "leadId"
          | "fullName"
          | "totalAmount"
          | "paymentStatus"
          | "paymentDate"
          | null) ?? "leadId",
      sortDir: searchParams.get("sortDir") === "asc" ? "asc" : "desc",
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "25"),
    });

    return NextResponse.json({
      ...result,
      rows: result.rows.map((row) => ({
        ...row,
        paymentDate: row.paymentDate?.toISOString() ?? null,
        createdAt: row.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/payouts failed:", error);
    return NextResponse.json(
      { error: "Failed to load payouts." },
      { status: 500 },
    );
  }
}
