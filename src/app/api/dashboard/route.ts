import { NextResponse } from "next/server";
import { buildDashboardSnapshot, getDashboardMeta } from "@/lib/dashboard";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = url.searchParams.get("year") ?? undefined;
  const month = url.searchParams.get("month") ?? undefined;
  const meta = getDashboardMeta();
  const snapshot = buildDashboardSnapshot(year, month);

  return NextResponse.json(
    {
      years: meta.years,
      monthsByYear: meta.monthsByYear,
      snapshot,
    },
    {
      headers: corsHeaders,
    },
  );
}
