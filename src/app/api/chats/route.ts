import { getOwnerId, json, jsonError, rateLimited, readJsonBody } from "@/lib/api";
import { generationLimiter } from "@/lib/rate-limit";
import { getPrisma } from "@/lib/db";
import { listChats, sendChatMessage } from "@/server/chats";
import { errorToResponse, prepareWrite, withCookie } from "@/server/route-helpers";

/** GET /api/chats: the current owner's non-empty chats (read-only). */
export async function GET(request: Request) {
  const ownerId = getOwnerId(request);
  if (!ownerId) return json({ chats: [] });
  try {
    return json({ chats: await listChats(getPrisma(), ownerId) });
  } catch (error) {
    return errorToResponse(error);
  }
}

/**
 * POST /api/chats: first message from /chat/new. Creates (or reuses the empty)
 * session, saves the user message and Mia's answer in one transaction.
 * Body: { message, settings?: {model,temperature,topP}, personaId?, hasAttachment? }
 */
export async function POST(request: Request) {
  const prepared = prepareWrite(request, ["POST"]);
  if (!prepared.ok) return prepared.response;
  const { ctx } = prepared;

  // Rate limits run BEFORE the artificial delay and before any database write.
  const gate = generationLimiter.acquire(ctx.ownerId, ctx.ip);
  if (!gate.ok) return rateLimited(gate.retryAfterSeconds);
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    const data = body.value as Record<string, unknown>;

    const result = await sendChatMessage(getPrisma(), {
      ownerId: ctx.ownerId,
      sessionId: null,
      message: data.message,
      settings: data.settings,
      personaId: data.personaId,
      hasAttachment: data.hasAttachment === true,
    });
    return withCookie(json(result, 201), ctx);
  } catch (error) {
    return errorToResponse(error);
  } finally {
    gate.release();
  }
}
