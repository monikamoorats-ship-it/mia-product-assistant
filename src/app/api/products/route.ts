import { getOwnerId, json, jsonError, readJsonBody } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { searchProducts } from "@/lib/product-search";
import { createProduct, listProductDTOs } from "@/server/catalog";
import { errorToResponse, prepareWrite, withCookie } from "@/server/route-helpers";

/** GET /api/products?q=&category=: seeded products plus the owner's custom products. */
export async function GET(request: Request) {
  const ownerId = getOwnerId(request);
  const url = new URL(request.url);
  try {
    const all = await listProductDTOs(getPrisma(), ownerId);
    const products = searchProducts(all, (url.searchParams.get("q") ?? "").slice(0, 100), url.searchParams.get("category"));
    return json({ products });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** POST /api/products: create a custom product, or { duplicateOf: id } to copy a visible one. */
export async function POST(request: Request) {
  const prepared = prepareWrite(request, ["POST"]);
  if (!prepared.ok) return prepared.response;
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    if (typeof body.value !== "object" || body.value === null) return jsonError(400, "That request could not be understood. Please try again.");
    const product = await createProduct(getPrisma(), prepared.ctx.ownerId, body.value as Record<string, unknown>);
    return withCookie(json({ product }, 201), prepared.ctx);
  } catch (error) {
    return errorToResponse(error);
  }
}
