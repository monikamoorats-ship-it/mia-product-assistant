import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERSONA_SEEDS,
  PRODUCT_CSV_HEADERS,
  SeedValidationError,
  parseProductsCsv,
  prepareSeedRecords,
} from "@/lib/seed-data";

const CSV_PATH = path.resolve(__dirname, "../../prisma/products.csv");
const realCsv = () => readFileSync(CSV_PATH, "utf8");

const HEADER = PRODUCT_CSV_HEADERS.join(",");
const row = (over: Partial<Record<(typeof PRODUCT_CSV_HEADERS)[number], string>> = {}) => {
  const base = {
    seed_key: "test-product",
    product: "Test product",
    active_substance: "testium",
    category: "Testing",
    use_for: "Testing things",
    how_to_use: "Use it",
    tip: "A tip",
    ...over,
  };
  return PRODUCT_CSV_HEADERS.map((h) => `"${base[h]}"`).join(",");
};

describe("products.csv", () => {
  it("parses the committed file into the 7 sample products", () => {
    const products = parseProductsCsv(realCsv());
    expect(products.map((p) => p.name)).toEqual([
      "Ibuprofen 400 mg tablets",
      "Paracetamol 500 mg tablets",
      "Cetirizine 10 mg tablets",
      "Loperamide 2 mg capsules",
      "Omeprazole 20 mg capsules",
      "Xylometazoline 0.1% nasal spray",
      "Vitamin D3 1000 IU tablets",
    ]);
  });

  it("keeps every field in its own column (quoted commas stay inside the field)", () => {
    const ibuprofen = parseProductsCsv(realCsv())[0];
    expect(ibuprofen).toEqual({
      seedKey: "ibuprofen-400mg-tablets",
      name: "Ibuprofen 400 mg tablets",
      activeSubstance: "ibuprofen",
      category: "Pain and fever",
      useFor: "Pain, fever, inflammation",
      howToUse: "Adults: 1 tablet up to 3 times a day, max 3 tablets per day",
      tip: "Take with or after food to protect the stomach",
    });
  });

  it("gives every product a unique, well-formed seed key and a tip", () => {
    const products = parseProductsCsv(realCsv());
    const keys = products.map((p) => p.seedKey);
    expect(new Set(keys).size).toBe(7);
    for (const p of products) {
      expect(p.seedKey).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.tip).not.toBe("");
    }
  });

  it("is deterministic: preparing twice yields identical records", () => {
    expect(prepareSeedRecords(realCsv())).toEqual(prepareSeedRecords(realCsv()));
  });

  it("rejects the old malformed layout (stray quote wrapping several fields)", () => {
    const malformed = `product,active_substance,category,use_for,how_to_use,tip\n"Ibuprofen 400 mg tablets,ibuprofen,Pain and fever,""Pain, fever"",""Adults: 1 tablet"",Take with food"\n`;
    expect(() => parseProductsCsv(malformed)).toThrow(SeedValidationError);
  });

  it("rejects a wrong or missing header", () => {
    expect(() => parseProductsCsv(`seed_key,product\n"a","b"\n`)).toThrow(/header/);
    expect(() => parseProductsCsv("")).toThrow(SeedValidationError);
  });

  it("rejects a file with a header but no products", () => {
    expect(() => parseProductsCsv(`${HEADER}\n`)).toThrow(/no products/);
  });

  it("rejects rows with the wrong number of columns", () => {
    expect(() => parseProductsCsv(`${HEADER}\n"a","b","c"\n`)).toThrow(SeedValidationError);
  });

  it("rejects empty required fields but allows an empty tip", () => {
    expect(() => parseProductsCsv(`${HEADER}\n${row({ product: " " })}\n`)).toThrow(/required/);
    expect(parseProductsCsv(`${HEADER}\n${row({ tip: "" })}\n`)[0].tip).toBe("");
  });

  it("rejects over-long fields", () => {
    expect(() => parseProductsCsv(`${HEADER}\n${row({ category: "x".repeat(51) })}\n`)).toThrow(/longer than 50/);
    expect(() => parseProductsCsv(`${HEADER}\n${row({ tip: "x".repeat(301) })}\n`)).toThrow(/longer than 300/);
  });

  it("rejects malformed and duplicate seed keys", () => {
    expect(() => parseProductsCsv(`${HEADER}\n${row({ seed_key: "Bad Key" })}\n`)).toThrow(/seed_key/);
    expect(() => parseProductsCsv(`${HEADER}\n${row()}\n${row()}\n`)).toThrow(/duplicate/);
  });
});

describe("persona seeds", () => {
  it("maps the three default personas to their immutable keys", () => {
    expect(PERSONA_SEEDS.map((p) => [p.seedKey, p.name])).toEqual([
      ["customer-guide", "Customer"],
      ["learning-coach", "New Employee"],
      ["product-expert", "Pharmacist"],
    ]);
  });

  it("prepareSeedRecords returns both personas and products", () => {
    const prepared = prepareSeedRecords(realCsv());
    expect(prepared.personas).toHaveLength(3);
    expect(prepared.products).toHaveLength(7);
  });
});
