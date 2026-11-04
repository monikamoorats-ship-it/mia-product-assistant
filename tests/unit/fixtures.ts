import { readFileSync } from "node:fs";
import path from "node:path";
import { parseProductsCsv } from "@/lib/seed-data";

export type TestProduct = {
  id: string;
  ownerId: string | null;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  howToUse: string;
  tip: string;
};

/** The 7 seeded products from the committed CSV, as global (ownerId null) records. */
export function seededProducts(): TestProduct[] {
  const csv = readFileSync(path.resolve(__dirname, "../../prisma/products.csv"), "utf8");
  return parseProductsCsv(csv).map((p) => ({
    id: p.seedKey,
    ownerId: null,
    name: p.name,
    activeSubstance: p.activeSubstance,
    category: p.category,
    useFor: p.useFor,
    howToUse: p.howToUse,
    tip: p.tip,
  }));
}

export function customProduct(over: Partial<TestProduct> & { ownerId: string }): TestProduct {
  return {
    id: `custom-${over.name ?? "x"}`,
    name: "Custom product",
    activeSubstance: "customium",
    category: "Custom",
    useFor: "Custom use",
    howToUse: "Use it",
    tip: "",
    ...over,
  };
}
