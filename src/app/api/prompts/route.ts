import { getOwnerId, json, jsonError, readJsonBody } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { createPersona, listPersonaDTOs } from "@/server/catalog";
import { errorToResponse, prepareWrite, withCookie } from "@/server/route-helpers";

/** GET /api/prompts: seeded personas plus the owner's custom personas. */
export async function GET(request: Request) {
  try {
    return json({ prompts: await listPersonaDTOs(getPrisma(), getOwnerId(request)) });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** POST /api/prompts: create a custom persona, or { duplicateOf: id } to copy a visible one. */
export async function POST(request: Request) {
  const prepared = prepareWrite(request, ["POST"]);
  if (!prepared.ok) return prepared.response;
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    const prompt = await createPersona(getPrisma(), prepared.ctx.ownerId, body.value as Record<string, unknown>);
    return withCookie(json({ prompt }, 201), prepared.ctx);
  } catch (error) {
    return errorToResponse(error);
  }
}
