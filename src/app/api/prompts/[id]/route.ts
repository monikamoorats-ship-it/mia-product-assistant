import { json, jsonError, readJsonBody } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { deletePersona, updatePersona } from "@/server/catalog";
import { errorToResponse, prepareWrite } from "@/server/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/prompts/[id]: edit one of your own custom personas. */
export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["PUT"]);
  if (!prepared.ok) return prepared.response;
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    return json({ prompt: await updatePersona(getPrisma(), prepared.ctx.ownerId, id, body.value) });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** DELETE /api/prompts/[id]: delete one of your own custom personas (chats fall back to Customer). */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["DELETE"]);
  if (!prepared.ok) return prepared.response;
  try {
    await deletePersona(getPrisma(), prepared.ctx.ownerId, id);
    return json({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
