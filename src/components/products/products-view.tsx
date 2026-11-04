"use client";

import { Pill, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { ManageProducts } from "./manage-products";
import { ClientApiError, apiFetch } from "@/lib/client-api";
import { categoriesOf, searchProducts } from "@/lib/product-search";
import type { ProductDTO } from "@/server/catalog";
import { ApiNotice } from "../api-notice";

export function ProductsView({
  products,
  selectedId,
}: {
  products: ProductDTO[];
  /** Value of ?product=, or null. May not match any visible product. */
  selectedId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [manageOpen, setManageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => categoriesOf(products), [products]);
  const visible = useMemo(() => searchProducts(products, query, category || null), [products, query, category]);
  const selected = selectedId ? products.find((p) => p.id === selectedId) ?? null : null;

  async function duplicate(id: string) {
    setError(null);
    try {
      await apiFetch("/api/products", { method: "POST", body: { duplicateOf: id } });
      router.replace("/products");
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">Products</h1>
          <Button variant="secondary" onClick={() => setManageOpen(true)}>
            <Settings2 className="size-4" aria-hidden /> Manage Products
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search products by name, active substance or symptom"
              placeholder="Search by name, active substance or symptom"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 md:text-sm"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {error && <ApiNotice message={error} />}

        {visible.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            No products match your search. Try a different word or clear the category filter.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products?product=${encodeURIComponent(p.id)}`}
                  prefetch={false}
                  className="flex h-full min-h-11 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300 hover:shadow"
                >
                  <span className="flex items-start gap-2">
                    <Pill className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
                    <span className="font-semibold text-slate-900">{p.name}</span>
                  </span>
                  <span className="text-xs text-teal-700">
                    {p.category}
                    {!p.seeded && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">My product</span>}
                  </span>
                  <span className="text-sm text-slate-600">{p.useFor}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* URL-driven detail view: ?product=<id> */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) router.replace("/products");
        }}
        title={selected ? selected.name : "Product not found"}
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["Product", selected.name],
                  ["Active substance", selected.activeSubstance],
                  ["Category", selected.category],
                  ["Use for", selected.useFor],
                  ["How to use", selected.howToUse],
                  ["Tip", selected.tip || "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium text-slate-500">{label}</dt>
                  <dd className="text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-500">General information from the demo catalogue. Ask a pharmacist if you’re unsure.</p>
            {selected.seeded && (
              <Button variant="secondary" onClick={() => void duplicate(selected.id)}>
                Duplicate to my products
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This product doesn’t exist or is no longer available.</p>
        )}
      </Dialog>

      <ManageProducts open={manageOpen} onOpenChange={setManageOpen} products={products} />
    </div>
  );
}
