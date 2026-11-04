import { getOwnerId, json, jsonError, notFound, readJsonBody } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { deleteProduct, getProductDTO, updateProduct } from "@/server/catalog";
import { errorToResponse, prepareWrite } from "@/server/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/products/[id]: visibility is enforced here too; unknown and foreign IDs look identical. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const product = await getProductDTO(getPrisma(), getOwnerId(request), id);
    return product ? json({ product }) : notFound();
  } catch (error) {
    return errorToResponse(error);
  }
}

/** PUT /api/products/[id]: edit one of your own custom products. */
export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["PUT"]);
  if (!prepared.ok) return prepared.response;
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    return json({ product: await updateProduct(getPrisma(), prepared.ctx.ownerId, id, body.value) });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** DELETE /api/products/[id]: remove one of your own custom products. Chat history keeps its snapshots. */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const prepared = prepareWrite(request, ["DELETE"]);
  if (!prepared.ok) return prepared.response;
  try {
    await deleteProduct(getPrisma(), prepared.ctx.ownerId, id);
    return json({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
