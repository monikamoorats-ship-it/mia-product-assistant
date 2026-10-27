/**
 * Catalogue search for the Products view (not the chat matcher): a
 * case-insensitive "contains" search over product name, active substance and
 * the symptoms in "use for", plus an exact category filter. Pure.
 */
export type SearchableProduct = {
  name: string;
  activeSubstance: string;
  useFor: string;
  category: string;
};

const fold = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function searchProducts<P extends SearchableProduct>(
  products: readonly P[],
  query: string,
  category: string | null,
): P[] {
  const q = fold(query);
  return products.filter((p) => {
    if (category && p.category !== category) return false;
    if (q === "") return true;
    return [p.name, p.activeSubstance, p.useFor].some((field) => fold(field).includes(q));
  });
}

/** Distinct categories, sorted alphabetically. */
export function categoriesOf(products: readonly { category: string }[]): string[] {
  return [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "en"));
}
