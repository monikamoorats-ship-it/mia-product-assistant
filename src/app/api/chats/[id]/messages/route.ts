import { json, jsonError, notFound, rateLimited, readJsonBody } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { generationLimiter } from "@/lib/rate-limit";
import { clearChat, sendChatMessage } from "@/server/chats";
import { errorToResponse, prepareWrite, withCookie } from "@/server/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/chats/[id]/messages: Body { message, hasAttachment? }. Uses the saved chat settings. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["POST"]);
  if (!prepared.ok) return prepared.response;
  const { ctx } = prepared;

  const gate = generationLimiter.acquire(ctx.ownerId, ctx.ip);
  if (!gate.ok) return rateLimited(gate.retryAfterSeconds);
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    const data = body.value as Record<string, unknown>;
    const result = await sendChatMessage(getPrisma(), {
      ownerId: ctx.ownerId,
      sessionId: id,
      message: data.message,
      hasAttachment: data.hasAttachment === true,
    });
    return withCookie(json(result, 201), ctx);
  } catch (error) {
    return errorToResponse(error);
  } finally {
    gate.release();
  }
}

/** DELETE /api/chats/[id]/messages: Clear Chat. Keeps the session and its settings. */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["DELETE"]);
  if (!prepared.ok) return prepared.response;
  try {
    const cleared = await clearChat(getPrisma(), prepared.ctx.ownerId, id);
    return cleared ? json({ ok: true }) : notFound();
  } catch (error) {
    return errorToResponse(error);
  }
}
