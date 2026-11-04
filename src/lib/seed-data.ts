/**
 * Pure seed-record preparation. No Prisma imports and no database access, so
 * it can be unit-tested without PostgreSQL. prisma/seed.ts does the writing.
 */
import { parse } from "csv-parse/sync";
import { FIELD_LIMITS } from "./limits";

export const PRODUCT_CSV_HEADERS = [
  "seed_key",
  "product",
  "active_substance",
  "category",
  "use_for",
  "how_to_use",
  "tip",
] as const;

export type ProductSeed = {
  seedKey: string;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  howToUse: string;
  tip: string;
};

export type PersonaSeed = {
  seedKey: string;
  name: string;
  content: string;
};

export class SeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedValidationError";
  }
}

const SEED_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Default personas. Their behaviour is chosen by seedKey, never by name:
 *   customer-guide -> Customer     (simple everyday language)
 *   learning-coach -> New Employee (adds a counselling tip)
 *   product-expert -> Pharmacist   (short structured summary)
 */
export const PERSONA_SEEDS: readonly PersonaSeed[] = [
  {
    seedKey: "customer-guide",
    name: "Customer",
    content:
      "Explain products in simple, everyday language with minimal jargon. Focus on practical benefits and how to use the product.",
  },
  {
    seedKey: "learning-coach",
    name: "New Employee",
    content:
      "Give supportive, educational explanations with some background, and add a short customer-counselling or product-learning tip.",
  },
  {
    seedKey: "product-expert",
    name: "Pharmacist",
    content:
      "Give concise, professional, structured information, including composition, use and the warning information available in the product data.",
  },
];

type Column = { header: string; field: keyof ProductSeed; max: number; required: boolean };

const COLUMNS: readonly Column[] = [
  { header: "seed_key", field: "seedKey", max: 100, required: true },
  { header: "product", field: "name", max: FIELD_LIMITS.productName, required: true },
  { header: "active_substance", field: "activeSubstance", max: FIELD_LIMITS.activeSubstance, required: true },
  { header: "category", field: "category", max: FIELD_LIMITS.category, required: true },
  { header: "use_for", field: "useFor", max: FIELD_LIMITS.useFor, required: true },
  { header: "how_to_use", field: "howToUse", max: FIELD_LIMITS.howToUse, required: true },
  { header: "tip", field: "tip", max: FIELD_LIMITS.tip, required: false },
];

/**
 * Parses and validates the products CSV. Throws SeedValidationError before
 * anything is written if the headers, column counts, required fields, lengths
 * or seed keys are wrong.
 */
export function parseProductsCsv(text: string): ProductSeed[] {
  let rows: string[][];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    }) as string[][];
  } catch {
    throw new SeedValidationError("products.csv is malformed and could not be parsed.");
  }

  const [header, ...records] = rows;
  if (!header || header.join(",") !== PRODUCT_CSV_HEADERS.join(",")) {
    throw new SeedValidationError(
      `products.csv must start with the header: ${PRODUCT_CSV_HEADERS.join(",")}`,
    );
  }
  if (records.length === 0) {
    throw new SeedValidationError("products.csv contains no products.");
  }

  const seenKeys = new Set<string>();
  return records.map((record, index) => {
    const line = index + 2; // 1-based, header is line 1
    if (record.length !== COLUMNS.length) {
      throw new SeedValidationError(
        `products.csv line ${line} has ${record.length} columns, expected ${COLUMNS.length}.`,
      );
    }
    const product = {} as ProductSeed;
    COLUMNS.forEach((column, i) => {
      const value = record[i].trim();
      if (column.required && value === "") {
        throw new SeedValidationError(`products.csv line ${line}: "${column.header}" is required.`);
      }
      if (value.length > column.max) {
        throw new SeedValidationError(
          `products.csv line ${line}: "${column.header}" is longer than ${column.max} characters.`,
        );
      }
      product[column.field] = value;
    });
    if (!SEED_KEY_PATTERN.test(product.seedKey)) {
      throw new SeedValidationError(
        `products.csv line ${line}: "seed_key" must be lowercase letters, digits and hyphens.`,
      );
    }
    if (seenKeys.has(product.seedKey)) {
      throw new SeedValidationError(`products.csv line ${line}: duplicate seed_key.`);
    }
    seenKeys.add(product.seedKey);
    return product;
  });
}

/** Validates the built-in personas (names and content within limits, unique keys). */
export function validatePersonaSeeds(personas: readonly PersonaSeed[] = PERSONA_SEEDS): PersonaSeed[] {
  const keys = new Set<string>();
  const names = new Set<string>();
  for (const persona of personas) {
    if (!SEED_KEY_PATTERN.test(persona.seedKey) || keys.has(persona.seedKey)) {
      throw new SeedValidationError("Persona seed keys must be unique and well-formed.");
    }
    if (names.has(persona.name)) {
      throw new SeedValidationError("Persona names must be unique.");
    }
    if (
      persona.name.length === 0 ||
      persona.name.length > FIELD_LIMITS.personaName ||
      persona.content.length === 0 ||
      persona.content.length > FIELD_LIMITS.personaContent
    ) {
      throw new SeedValidationError("Persona name or content is empty or too long.");
    }
    keys.add(persona.seedKey);
    names.add(persona.name);
  }
  return [...personas];
}

export type PreparedSeed = { products: ProductSeed[]; personas: PersonaSeed[] };

/** Validates everything the seed will write. Pure: no I/O, no database. */
export function prepareSeedRecords(csvText: string): PreparedSeed {
  return {
    products: parseProductsCsv(csvText),
    personas: validatePersonaSeeds(),
  };
}
