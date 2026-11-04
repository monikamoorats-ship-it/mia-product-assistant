import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { checkHealth } from "@/lib/health";

// Always evaluated at request time; the build must never query PostgreSQL.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth(() => getPrisma().$queryRaw`SELECT 1 FROM "SystemPrompt" LIMIT 1`);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
