import { describe, expect, it } from "vitest";
import { categoriesOf, searchProducts } from "@/lib/product-search";
import { seededProducts } from "./fixtures";

const products = seededProducts();
const names = (q: string, category: string | null = null) => searchProducts(products, q, category).map((p) => p.name);

describe("catalogue search", () => {
  it("returns everything for an empty query", () => {
    expect(names("")).toHaveLength(7);
    expect(names("   ")).toHaveLength(7);
  });

  it("finds by product name, case-insensitively", () => {
    expect(names("IBUPROFEN")).toEqual(["Ibuprofen 400 mg tablets"]);
  });

  it("finds by active substance", () => {
    expect(names("cholecalciferol")).toEqual(["Vitamin D3 1000 IU tablets"]);
  });

  it("finds by symptom (use for)", () => {
    expect(names("hay fever")).toEqual(["Cetirizine 10 mg tablets"]);
    expect(names("blocked nose")).toEqual(["Xylometazoline 0.1% nasal spray"]);
  });

  it("filters by category and combines with the query", () => {
    expect(names("", "Digestion")).toEqual(["Loperamide 2 mg capsules", "Omeprazole 20 mg capsules"]);
    expect(names("fever", "Pain and fever")).toHaveLength(2);
    expect(names("hay fever", "Digestion")).toEqual([]);
  });

  it("returns nothing for an unknown query", () => {
    expect(names("zzzz")).toEqual([]);
  });

  it("lists distinct categories alphabetically", () => {
    expect(categoriesOf(products)).toEqual(["Allergy", "Cold and flu", "Digestion", "Pain and fever", "Vitamins"]);
  });
});
