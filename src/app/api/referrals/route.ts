import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Admin referrals API is not part of the launch slice." },
    { status: 501 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Admin referrals API is not part of the launch slice." },
    { status: 501 },
  );
}
