import Link from "next/link";
import { Pill } from "lucide-react";

export type CardData =
  | { unavailable: true }
  | {
      unavailable: false;
      linkAvailable: boolean;
      product: {
        productId: string;
        name: string;
        activeSubstance: string;
        category: string;
        useFor: string;
        howToUse: string | null;
        tip: string;
        source: "seeded" | "custom";
      };
    };

/** Compact product card rendered from the immutable snapshot stored with the message. */
export function ProductCard({ card }: { card: CardData }) {
  if (card.unavailable) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
        This product is no longer available.
      </div>
    );
  }
  const { product, linkAvailable } = card;
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm" aria-label={`Product: ${product.name}`}>
      <header className="flex items-start gap-2">
        <Pill className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{product.name}</h3>
          <p className="text-xs text-teal-700">{product.category}</p>
        </div>
      </header>
      <dl className="mt-2 space-y-1 text-slate-700">
        <div>
          <dt className="inline font-medium">Use for: </dt>
          <dd className="inline">{product.useFor}</dd>
        </div>
        <div>
          <dt className="inline font-medium">How to use: </dt>
          <dd className="inline">{product.howToUse ?? "Not shown for this type of question."}</dd>
        </div>
        {product.tip && (
          <div>
            <dt className="inline font-medium">Tip: </dt>
            <dd className="inline">{product.tip}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-xs text-slate-500">Product information at the time of this answer</p>
      {linkAvailable ? (
        <Link
          href={`/products?product=${encodeURIComponent(product.productId)}`}
          prefetch={false}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
        >
          View current product
          <span className="sr-only"> (the current product may have changed since this answer)</span>
        </Link>
      ) : (
        <p className="mt-1 text-xs text-slate-500">This product is no longer available in the current catalogue.</p>
      )}
    </article>
  );
}
