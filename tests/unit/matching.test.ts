import { describe, expect, it } from "vitest";
import {
  STOP_WORDS,
  WEIGHTS,
  filterVisibleProducts,
  matchProducts,
  mentionsIdentifiableProduct,
  queryKeywords,
  wordsMatch,
} from "@/lib/matching";
import { customProduct, seededProducts } from "./fixtures";

const products = seededProducts();
const names = (query: string, list = products) => matchProducts(query, list).matches.map((m) => m.product.name);

describe("query normalisation", () => {
  it("lowercases, strips punctuation/hyphens, de-duplicates and drops stop words and short words", () => {
    expect(queryKeywords("What helps with HAY-fever?! Hay fever, hay.")).toEqual(["hay", "fever"]);
  });

  it("treats dosage forms and units as stop words", () => {
    for (const word of ["tablet", "tablets", "capsule", "capsules", "spray", "mg", "iu"]) {
      expect(STOP_WORDS.has(word)).toBe(true);
    }
    expect(queryKeywords("tablets capsules spray mg IU")).toEqual([]);
  });

  it("ignores words shorter than three characters", () => {
    expect(queryKeywords("ok is on an")).toEqual([]);
  });
});

describe("word matching", () => {
  it("matches exact words and a shared prefix of at least four characters", () => {
    expect(wordsMatch("allergy", "allergy")).toBe(true);
    expect(wordsMatch("allergies", "allergy")).toBe(true);
    expect(wordsMatch("allergy", "allergies")).toBe(true);
  });

  it("does not match unrelated, short-prefix or substring-only words", () => {
    expect(wordsMatch("pai", "pain")).toBe(false);
    expect(wordsMatch("fever", "ever")).toBe(false);
    expect(wordsMatch("ache", "headache")).toBe(false);
  });
});

describe("scoring and results", () => {
  it("documents the weights", () => {
    expect(WEIGHTS).toEqual({ name: 3, activeSubstance: 3, useFor: 2, category: 1 });
  });

  it("What helps with hay fever? leads with Cetirizine", () => {
    const result = names("What helps with hay fever?");
    expect(result[0]).toBe("Cetirizine 10 mg tablets");
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("Which products contain paracetamol? returns only Paracetamol", () => {
    expect(names("Which products contain paracetamol?")).toEqual(["Paracetamol 500 mg tablets"]);
  });

  it("pain returns the pain products sorted alphabetically on a tie", () => {
    expect(names("pain")).toEqual(["Ibuprofen 400 mg tablets", "Paracetamol 500 mg tablets"]);
  });

  it("a complete product name returns only that product", () => {
    const result = matchProducts("Tell me about Ibuprofen 400 mg tablets please", products);
    expect(result.mode).toBe("exact-name");
    expect(result.matches.map((m) => m.product.name)).toEqual(["Ibuprofen 400 mg tablets"]);
  });

  it("tablets alone matches nothing", () => {
    expect(matchProducts("tablets", products)).toEqual({ mode: "none", matches: [] });
  });

  it("an unknown or meaningless query matches nothing", () => {
    expect(matchProducts("xyzzy qwerty", products).mode).toBe("none");
    expect(matchProducts("???", products).mode).toBe("none");
    expect(matchProducts("", products).mode).toBe("none");
  });

  it("handles singular and plural forms", () => {
    expect(names("allergies")).toEqual(["Cetirizine 10 mg tablets"]);
    expect(names("allergy")).toEqual(["Cetirizine 10 mg tablets"]);
  });

  it("repeating a word does not increase the score", () => {
    const once = matchProducts("fever", products).matches[0].score;
    const many = matchProducts("fever fever fever fever", products).matches[0].score;
    expect(many).toBe(once);
  });

  it("breaks score ties alphabetically by product name", () => {
    const a = customProduct({ ownerId: "o", id: "a", name: "Zeta balm", activeSubstance: "zetium", useFor: "Itching" });
    const b = customProduct({ ownerId: "o", id: "b", name: "Alpha balm", activeSubstance: "alphium", useFor: "Itching" });
    expect(names("itching", [a, b])).toEqual(["Alpha balm", "Zeta balm"]);
  });

  it("returns at most three products", () => {
    const many = ["Aaa", "Bbb", "Ccc", "Ddd", "Eee"].map((n) =>
      customProduct({ ownerId: "o", id: n, name: `${n} cream`, activeSubstance: `${n.toLowerCase()}ium`, useFor: "Itching" }),
    );
    expect(matchProducts("itching", many).matches).toHaveLength(3);
  });

  it("matches nothing from a blocked-nose query other than Xylometazoline", () => {
    expect(names("blocked nose")).toEqual(["Xylometazoline 0.1% nasal spray"]);
  });
});

describe("owner visibility", () => {
  const mine = customProduct({ ownerId: "owner-a", id: "mine", name: "My pain balm", useFor: "Pain" });
  const theirs = customProduct({ ownerId: "owner-b", id: "theirs", name: "Their pain balm", useFor: "Pain" });
  const all = [...products, mine, theirs];

  it("shows seeded and own custom products only", () => {
    const visible = filterVisibleProducts(all, "owner-a").map((p) => p.id);
    expect(visible).toContain("mine");
    expect(visible).not.toContain("theirs");
    expect(visible).toContain("ibuprofen-400mg-tablets");
  });

  it("an ownerless visitor sees only seeded products", () => {
    expect(filterVisibleProducts(all, null)).toHaveLength(7);
  });

  it("never matches another owner's custom products", () => {
    const visible = filterVisibleProducts(all, "owner-a");
    expect(names("pain balm", visible)).toContain("My pain balm");
    expect(names("pain balm", visible)).not.toContain("Their pain balm");
    expect(names("Their pain balm", visible)).not.toContain("Their pain balm");
  });
});

describe("mentionsIdentifiableProduct", () => {
  it("is true for a product or active substance name and false for symptoms", () => {
    expect(mentionsIdentifiableProduct("How should I take ibuprofen?", products)).toBe(true);
    expect(mentionsIdentifiableProduct("What helps with hay fever?", products)).toBe(false);
  });
});
