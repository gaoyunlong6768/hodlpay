import { NextResponse } from "next/server";
import { getPrices } from "@/lib/prices";

export async function GET() {
  try {
    return NextResponse.json(await getPrices());
  } catch {
    return NextResponse.json({ error: "all price sources failed" }, { status: 502 });
  }
}
