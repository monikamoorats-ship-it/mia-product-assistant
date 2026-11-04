import { getOwnerId, json, notFound, readJsonBody, jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { deleteChat, getChat, updateChatSettings } from "@/server/chats";
import { errorToResponse, prepareWrite } from "@/server/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/chats/[id]: scoped to the owner; unknown and foreign IDs look identical. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ownerId = getOwnerId(request);
  if (!ownerId) return notFound();
  try {
    const chat = await getChat(getPrisma(), ownerId, id);
    return chat ? json(chat) : notFound();
  } catch (error) {
    return errorToResponse(error);
  }
}

/** PATCH /api/chats/[id]: save model, temperature, top-p and/or persona immediately. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["PATCH"]);
  if (!prepared.ok) return prepared.response;
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    const settings = await updateChatSettings(getPrisma(), prepared.ctx.ownerId, id, body.value as Record<string, unknown>);
    return json({ settings });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** DELETE /api/chats/[id]: deletes the whole chat; messages and snapshots cascade. */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["DELETE"]);
  if (!prepared.ok) return prepared.response;
  try {
    const deleted = await deleteChat(getPrisma(), prepared.ctx.ownerId, id);
    return deleted ? json({ ok: true }) : notFound();
  } catch (error) {
    return errorToResponse(error);
  }
}
