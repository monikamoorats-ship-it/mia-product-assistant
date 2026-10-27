"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiNotice } from "../api-notice";
import { Button } from "../ui/button";
import { ConfirmDialog, Dialog } from "../ui/dialog";
import { ProductForm } from "./product-form";
import { ClientApiError, apiFetch } from "@/lib/client-api";
import type { ProductDTO } from "@/server/catalog";

type Mode = { kind: "list" } | { kind: "form"; product: ProductDTO | null };

export function ManageProducts({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductDTO[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [deleting, setDeleting] = useState<ProductDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const custom = products.filter((p) => !p.seeded);
  const seeded = products.filter((p) => p.seeded);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    if (!next) {
      setMode({ kind: "list" });
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={close}
        title="Manage Products"
        description="Seeded products are read-only. Add your own products, or duplicate a seeded product and edit your copy. Custom products are only visible in this browser profile."
      >
        {mode.kind === "form" ? (
          <ProductForm
            productId={mode.product?.id ?? null}
            initial={mode.product ?? undefined}
            onCancel={() => setMode({ kind: "list" })}
            onSaved={() => {
              setMode({ kind: "list" });
              router.refresh();
            }}
          />
        ) : (
          <div className="space-y-5">
            {error && <ApiNotice message={error} />}
            <section aria-labelledby="my-products">
              <div className="flex items-center justify-between">
                <h3 id="my-products" className="text-sm font-semibold text-slate-900">
                  My products ({custom.length}/20)
                </h3>
                <Button onClick={() => setMode({ kind: "form", product: null })}>
                  <Plus className="size-4" aria-hidden /> Add product
                </Button>
              </div>
              {custom.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">You haven’t added any products yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {custom.map((p) => (
                    <li key={p.id} className="flex items-center gap-1 p-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{p.name}</span>
                      <Button variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setMode({ kind: "form", product: p })}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                        <Trash2 className="size-4 text-red-600" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="seeded-products">
              <h3 id="seeded-products" className="text-sm font-semibold text-slate-900">
                Seeded products (read-only)
              </h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {seeded.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 p-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{p.name}</span>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={`Duplicate ${p.name}`}
                      onClick={() => void run(() => apiFetch("/api/products", { method: "POST", body: { duplicateOf: p.id } }))}
                    >
                      <Copy className="size-4" aria-hidden /> Duplicate
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Deleting this product removes it from the catalogue. Product information already included in previous chat messages will remain as historical content."
        confirmLabel="Delete product"
        busy={busy}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          void run(() => apiFetch(`/api/products/${target.id}`, { method: "DELETE" })).then(() => setDeleting(null));
        }}
      />
    </>
  );
}
