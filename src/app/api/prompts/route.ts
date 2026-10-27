import { getOwnerId, json } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { errorToResponse } from "@/server/route-helpers";

/** GET /api/prompts: seeded personas plus the owner's custom personas. */
export async function GET(request: Request) {
  const ownerId = getOwnerId(request);
  try {
    const rows = await getPrisma().systemPrompt.findMany({
      where: ownerId ? { OR: [{ ownerId: null }, { ownerId }] } : { ownerId: null },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });
    return json({
      prompts: rows.map((p) => ({
        id: p.id,
        name: p.name,
        content: p.content,
        seeded: p.ownerId === null,
        seedKey: p.seedKey,
      })),
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
