import { json } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { clearHistory } from "@/server/chats";
import { errorToResponse, prepareWrite } from "@/server/route-helpers";

/**
 * DELETE /api/history: "Clear my history". Deletes all of the owner's chats
 * (messages and snapshots cascade) and quiz results in one transaction.
 * Custom products and personas are NOT touched.
 */
export async function DELETE(request: Request) {
  const prepared = prepareWrite(request, ["DELETE"]);
  if (!prepared.ok) return prepared.response;
  try {
    await clearHistory(getPrisma(), prepared.ctx.ownerId);
    return json({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
