import { cookies } from "next/headers";
import { DbUnavailable } from "@/components/db-unavailable";
import { ProductsView } from "@/components/products/products-view";
import { getPrisma } from "@/lib/db";
import { OWNER_COOKIE, ownerIdFromCookie } from "@/lib/owner";
import { listProductDTOs, type ProductDTO } from "@/server/catalog";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ product?: string | string[] }> }) {
  const { product } = await searchParams;
  const selectedId = typeof product === "string" && product !== "" ? product : null;
  const ownerId = ownerIdFromCookie((await cookies()).get(OWNER_COOKIE)?.value);

  let products: ProductDTO[];
  try {
    products = await listProductDTOs(getPrisma(), ownerId);
  } catch {
    return <DbUnavailable />;
  }
  // An unknown or another owner's product ID shows the same generic "Product not found" state.
  return <ProductsView products={products} selectedId={selectedId} />;
}
